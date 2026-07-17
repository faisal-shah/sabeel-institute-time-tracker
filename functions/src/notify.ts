// Push notifications: Firestore-trigger fan-out + the weekly submit reminder.
// Delivery is FCM via each user's registered pushTokens (see firestore.rules);
// per-event opt-outs live in users/{uid}.notifPrefs (missing = on).
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { dayKeyFor, type TimesheetDoc, type UserDoc } from '@sabeel/shared';
import {
  inReminderWindow,
  prefOn,
  reminderEligible,
  reminderPeriod,
  texts,
  type NotifText,
} from './notifyCore';
import { reportError, sentryDsn } from './sentry';

/**
 * Send to every device a user has registered; prune tokens FCM says are dead.
 * Quiet no-op when the user has no tokens (never opted in on any device).
 */
async function sendToUser(uid: string, text: NotifText): Promise<void> {
  const db = getFirestore();
  const tokensSnap = await db.collection('users').doc(uid).collection('pushTokens').get();
  if (tokensSnap.empty) return;
  const tokens = tokensSnap.docs.map((d) => d.id);
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: text.title, body: text.body },
  });
  await Promise.all(
    res.responses.map((r, i) => {
      const code = r.error?.code ?? '';
      const dead =
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-argument';
      return dead ? tokensSnap.docs[i].ref.delete() : Promise.resolve();
    }),
  );
}

/** A new profile doc is always a pending signup — tell the admins. */
export const notifyNewUser = onDocumentCreated(
  { document: 'users/{uid}', secrets: [sentryDsn] },
  async (event) => {
    try {
      const user = event.data?.data() as UserDoc | undefined;
      if (!user || user.status !== 'pending') return;
      const db = getFirestore();
      const admins = await db
        .collection('users')
        .where('admin', '==', true)
        .where('status', '==', 'active')
        .get();
      const text = texts.newUser(user.displayName, user.email);
      await Promise.all(
        admins.docs
          .filter((d) => d.id !== event.params.uid && prefOn((d.data() as UserDoc).notifPrefs, 'newUser'))
          .map((d) => sendToUser(d.id, text)),
      );
    } catch (e) {
      await reportError(e);
      throw e;
    }
  },
);

/** Timesheet lifecycle: submissions go to the approver, decisions to the owner. */
export const notifyTimesheet = onDocumentWritten(
  { document: 'timesheets/{sheetId}', secrets: [sentryDsn] },
  async (event) => {
    try {
      const before = event.data?.before?.exists
        ? (event.data.before.data() as TimesheetDoc)
        : null;
      const after = event.data?.after?.exists ? (event.data.after.data() as TimesheetDoc) : null;
      if (!after) return; // withdraw/reopen deletes — nothing to say
      const range = { fromKey: after.periodKey, toKey: after.toKey };
      const db = getFirestore();
      const userDoc = async (uid: string) =>
        (await db.collection('users').doc(uid).get()).data() as UserDoc | undefined;

      const becameSubmitted =
        after.status === 'submitted' && (!before || before.status !== 'submitted');
      if (becameSubmitted && after.approverUid !== after.uid) {
        const [owner, approver] = await Promise.all([
          userDoc(after.uid),
          userDoc(after.approverUid),
        ]);
        if (approver && prefOn(approver.notifPrefs, 'submitted')) {
          await sendToUser(
            after.approverUid,
            texts.submitted(owner?.displayName ?? after.uid, range, before?.status === 'rejected'),
          );
        }
        return;
      }

      const decided =
        before?.status === 'submitted' &&
        (after.status === 'approved' || after.status === 'rejected');
      if (decided && after.decidedBy !== after.uid) {
        const owner = await userDoc(after.uid);
        const key = after.status === 'approved' ? 'approved' : 'rejected';
        if (owner && prefOn(owner.notifPrefs, key)) {
          await sendToUser(
            after.uid,
            after.status === 'approved'
              ? texts.approved(range)
              : texts.rejected(range, after.rejectReason ?? ''),
          );
        }
      }
    } catch (e) {
      await reportError(e);
      throw e;
    }
  },
);

/**
 * Submit-your-week nudge: first fires Tuesday 10:00 in each user's last-seen
 * timezone (about the previous period), then repeats DAILY at 10:00 until that
 * period is submitted — only when there is actually something to submit (see
 * reminderEligible). Once-a-day dedup via lastReminderDayKey.
 */
export const weeklyReminder = onSchedule(
  { schedule: 'every 60 minutes', secrets: [sentryDsn] },
  async () => {
    try {
      const now = Date.now();
      const db = getFirestore();
      const users = await db.collection('users').where('status', '==', 'active').get();
      for (const snap of users.docs) {
        const user = snap.data() as UserDoc;
        if (!user.timeZone || !prefOn(user.notifPrefs, 'reminder')) continue;
        if (!inReminderWindow(now, user.timeZone)) continue;
        const todayKey = dayKeyFor(now, user.timeZone);
        const prev = reminderPeriod(todayKey);
        if (user.lastReminderDayKey === todayKey) continue;

        const sheet = await db.collection('timesheets').doc(`${snap.id}_${prev.fromKey}`).get();
        const status = sheet.exists ? (sheet.data() as TimesheetDoc).status : null;
        let hasEntries = false;
        if (status === null) {
          const entries = await db
            .collection('timeEntries')
            .where('uid', '==', snap.id)
            .where('dayKey', '>=', prev.fromKey)
            .where('dayKey', '<=', prev.toKey)
            .limit(1)
            .get();
          hasEntries = !entries.empty;
        }
        if (!reminderEligible(status, hasEntries)) continue;

        await sendToUser(snap.id, texts.reminder(prev));
        await snap.ref.update({ lastReminderDayKey: todayKey });
      }
    } catch (e) {
      await reportError(e);
      throw e;
    }
  },
);
