import { describe, it, beforeAll, beforeEach, expect } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runSync, type DriveTarget, type SyncResult } from '../../src/drive';
import type { Row } from '../../src/driveRows';

beforeAll(() => {
  if (getApps().length === 0) initializeApp({ projectId: 'demo-sabeel' });
});

async function reset() {
  const db = getFirestore();
  for (const c of ['timeEntries', 'users']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await db.collection('users').doc('alice').set({ displayName: 'Alice A.' });
  await db.collection('timeEntries').add({
    uid: 'alice',
    activityId: 'tut',
    activityName: 'Tutoring',
    start: Date.UTC(2026, 6, 13, 14, 0),
    end: Date.UTC(2026, 6, 13, 16, 0),
    durationMinutes: 120,
    timeZone: 'America/Chicago',
    dayKey: '2026-07-13',
    source: 'manual',
    createdAt: 1,
    updatedAt: 1,
  });
}

beforeEach(reset);

class FakeTarget implements DriveTarget {
  sheets = new Map<string, Row[]>();
  files = new Map<string, string>();
  async writeSheet(tab: string, rows: Row[]) {
    this.sheets.set(tab, rows);
  }
  async writeCsvFile(name: string, csv: string) {
    this.files.set(name, csv);
  }
}

describe('runSync', () => {
  it('is a no-op when no Drive target is configured (dev/emulator)', async () => {
    const res: SyncResult = await runSync(null);
    expect(res.skipped).toBe(true);
  });

  it('writes the three summary tabs from Firestore data', async () => {
    const t = new FakeTarget();
    const res = await runSync(t);
    expect(res.entryRows).toBe(1);
    expect([...t.sheets.keys()]).toEqual(['Entries', 'By person', 'By activity & month']);
    expect(t.sheets.get('By person')).toContainEqual(['Alice A.', 2]);
    expect(t.files.size).toBe(0); // no monthly snapshot unless asked
  });

  it('drops a monthly CSV snapshot when asked', async () => {
    const t = new FakeTarget();
    const res = await runSync(t, { monthToSnapshot: '2026-07' });
    expect(res.csvWritten).toBe('hours-2026-07.csv');
    const csv = t.files.get('hours-2026-07.csv')!;
    expect(csv).toContain('Alice A.');
    expect(csv).toContain('09:00,11:00'); // work-local CDT window
  });
});
