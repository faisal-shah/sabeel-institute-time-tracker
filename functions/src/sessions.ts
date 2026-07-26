import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  SESSION_CAP_HOURS,
  minutesBetween,
  type TimeEntryDoc,
  type TimesheetDoc,
} from '@sabeel/shared';
import { reportError, reportMessage, sentryDsn } from './sentry';

const CAP_MS = SESSION_CAP_HOURS * 60 * 60 * 1000;

/**
 * Closing an entry changes a period's hours — which is fine while the period is a
 * draft, and is NOT fine once its timesheet has been submitted or approved. Rules
 * forbid every client from touching an approved period; this job runs on the
 * admin SDK and bypasses them, so it has to honour that boundary itself.
 *
 * It cannot simply skip: leaving someone clocked in forever is worse than a
 * corrected total, and the entry would be re-examined every hour. So it closes
 * the entry, then repairs the sheet's stored snapshot so it stops contradicting
 * its own entries, and tells a human — an approved period changing after the fact
 * is exactly the kind of silent edit nobody would otherwise notice.
 */
async function reconcileSealedPeriod(uid: string, periodKey: string, entryId: string) {
  const db = getFirestore();
  const ref = db.collection(COLLECTIONS.timesheets).doc(`${uid}_${periodKey}`);
  const snap = await ref.get();
  if (!snap.exists) return; // draft period — nothing sealed, nothing to say
  const sheet = snap.data() as TimesheetDoc;
  if (sheet.status !== 'submitted' && sheet.status !== 'approved') return;

  const entries = await db
    .collection(COLLECTIONS.timeEntries)
    .where('uid', '==', uid)
    .where('dayKey', '>=', sheet.periodKey)
    .where('dayKey', '<=', sheet.toKey)
    .get();
  const closed = entries.docs
    .map((d) => d.data() as TimeEntryDoc)
    .filter((e) => e.end !== null);
  const totalMinutes = closed.reduce((s, e) => s + (e.durationMinutes ?? 0), 0);

  await ref.update({ totalMinutes, entryCount: closed.length, updatedAt: Date.now() });
  await reportMessage(`Auto-close touched a ${sheet.status} timesheet`, {
    uid,
    periodKey,
    entryId,
    status: sheet.status,
    totalMinutes,
    previousTotalMinutes: sheet.totalMinutes,
  });
}

/**
 * Close clock sessions left running past the cap. Caps the entry at start+cap,
 * marks it autoClosed, and clears the owner's activeEntryId pointer — so a
 * forgotten clock-in can't inflate someone's hours indefinitely. Pure core for
 * unit testing; the schedule wrapper injects `now`.
 */
export async function closeStaleSessions(now: number): Promise<number> {
  const db = getFirestore();
  // Running sessions have end == null; only those older than the cap qualify.
  const cutoff = now - CAP_MS;
  const snap = await db
    .collection('timeEntries')
    .where('end', '==', null)
    .where('start', '<=', cutoff)
    .get();

  let closed = 0;
  for (const docSnap of snap.docs) {
    const entry = docSnap.data() as TimeEntryDoc;
    const cappedEnd = entry.start + CAP_MS;
    const batch = db.batch();
    batch.update(docSnap.ref, {
      end: cappedEnd,
      durationMinutes: Math.max(1, minutesBetween(entry.start, cappedEnd)),
      autoClosed: true,
      updatedAt: now,
    });
    // Clear the pointer only if it still points at this entry.
    const userRef = db.collection('users').doc(entry.uid);
    const user = await userRef.get();
    if (user.exists && user.data()?.activeEntryId === docSnap.id) {
      batch.update(userRef, { activeEntryId: null });
    }
    await batch.commit();
    // After the entry is closed, not before: the repair must see the new total.
    await reconcileSealedPeriod(entry.uid, entry.periodKey, docSnap.id);
    closed++;
  }
  return closed;
}

export const autoCloseStaleSessions = onSchedule(
  { schedule: 'every 60 minutes', secrets: [sentryDsn] },
  async () => {
    try {
      const closed = await closeStaleSessions(Timestamp.now().toMillis());
      if (closed > 0) console.log(`autoCloseStaleSessions: closed ${closed} stale session(s)`);
    } catch (e) {
      await reportError(e);
      throw e;
    }
  },
);
