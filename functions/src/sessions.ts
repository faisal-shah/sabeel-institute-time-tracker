import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { SESSION_CAP_HOURS, minutesBetween, type TimeEntryDoc } from '@sabeel/shared';
import { reportError, sentryDsn } from './sentry';

const CAP_MS = SESSION_CAP_HOURS * 60 * 60 * 1000;

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
