import { describe, it, beforeAll, beforeEach, expect } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { closeStaleSessions } from '../../src/sessions';

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 15, 20, 0);

beforeAll(() => {
  if (getApps().length === 0) initializeApp({ projectId: 'demo-sabeel' });
});

async function reset() {
  const db = getFirestore();
  for (const c of ['timeEntries', 'users']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

const running = (startMsAgo: number) => ({
  uid: 'alice',
  activityId: 'a',
  activityName: 'Tutoring',
  start: NOW - startMsAgo,
  end: null,
  timeZone: 'America/Chicago',
  dayKey: '2026-07-15',
  source: 'clock',
  createdAt: 1,
  updatedAt: 1,
});

beforeEach(reset);

describe('closeStaleSessions', () => {
  it('caps a >12h running session at start+12h, clears the pointer', async () => {
    const db = getFirestore();
    const ref = await db.collection('timeEntries').add(running(13 * HOUR));
    await db.collection('users').doc('alice').set({ activeEntryId: ref.id, status: 'active' });

    const closed = await closeStaleSessions(NOW);
    expect(closed).toBe(1);

    const entry = (await ref.get()).data()!;
    expect(entry.autoClosed).toBe(true);
    expect(entry.end).toBe(entry.start + 12 * HOUR);
    expect(entry.durationMinutes).toBe(12 * 60);

    const user = (await db.collection('users').doc('alice').get()).data()!;
    expect(user.activeEntryId).toBeNull();
  });

  it('leaves a session running under the cap untouched', async () => {
    const db = getFirestore();
    const ref = await db.collection('timeEntries').add(running(3 * HOUR));
    await db.collection('users').doc('alice').set({ activeEntryId: ref.id, status: 'active' });

    const closed = await closeStaleSessions(NOW);
    expect(closed).toBe(0);
    expect((await ref.get()).data()!.end).toBeNull();
  });

  it("does not clear the pointer if it moved to a different entry", async () => {
    const db = getFirestore();
    const ref = await db.collection('timeEntries').add(running(20 * HOUR));
    await db.collection('users').doc('alice').set({ activeEntryId: 'someOther', status: 'active' });

    await closeStaleSessions(NOW);
    expect((await ref.get()).data()!.autoClosed).toBe(true);
    expect((await db.collection('users').doc('alice').get()).data()!.activeEntryId).toBe(
      'someOther',
    );
  });
});
