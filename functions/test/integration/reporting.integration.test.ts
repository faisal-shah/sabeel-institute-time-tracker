import { describe, it, beforeAll, beforeEach, expect } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildCsv, computeTotals } from '../../src/reporting';

const T = (dayKey: string, hhmmUTC: string) => {
  const [y, m, d] = dayKey.split('-').map(Number);
  const [h, min] = hhmmUTC.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h, min);
};

beforeAll(() => {
  if (getApps().length === 0) initializeApp({ projectId: 'demo-sabeel' });
});

async function seed() {
  const db = getFirestore();
  await db.collection('users').doc('alice').set({ displayName: 'Alice A.' });
  await db.collection('users').doc('bob').set({ displayName: 'Bob B.' });

  const entries = [
    // Alice, Tutoring, 2026-07-13, 2h
    {
      uid: 'alice',
      activityId: 'tut',
      activityName: 'Tutoring',
      start: T('2026-07-13', '14:00'),
      end: T('2026-07-13', '16:00'),
      durationMinutes: 120,
      timeZone: 'America/Chicago',
      dayKey: '2026-07-13',
      source: 'manual',
      note: 'with, comma',
      createdAt: 1,
      updatedAt: 1,
    },
    // Alice, Food Drive, 2026-07-15, 1h
    {
      uid: 'alice',
      activityId: 'fd',
      activityName: 'Food Drive',
      start: T('2026-07-15', '09:00'),
      end: T('2026-07-15', '10:00'),
      durationMinutes: 60,
      timeZone: 'America/Chicago',
      dayKey: '2026-07-15',
      source: 'clock',
      createdAt: 1,
      updatedAt: 1,
    },
    // Bob, Tutoring, 2026-07-14, 30m
    {
      uid: 'bob',
      activityId: 'tut',
      activityName: 'Tutoring',
      start: T('2026-07-14', '18:00'),
      end: T('2026-07-14', '18:30'),
      durationMinutes: 30,
      timeZone: 'America/Chicago',
      dayKey: '2026-07-14',
      source: 'manual',
      createdAt: 1,
      updatedAt: 1,
    },
    // Alice, running session (must be excluded everywhere)
    {
      uid: 'alice',
      activityId: 'tut',
      activityName: 'Tutoring',
      start: T('2026-07-15', '20:00'),
      end: null,
      timeZone: 'America/Chicago',
      dayKey: '2026-07-15',
      source: 'clock',
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  for (const e of entries) await db.collection('timeEntries').add(e);
}

beforeEach(async () => {
  // Emulator: wipe via REST is overkill here; just use unique data per run by
  // clearing the collections we touch.
  const db = getFirestore();
  for (const c of ['timeEntries', 'users']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await seed();
});

describe('computeTotals', () => {
  it('rolls up the whole range, excluding the running session', async () => {
    const t = await computeTotals({ fromKey: '2026-07-01', toKey: '2026-07-31' });
    expect(t.totalMinutes).toBe(210); // 120 + 60 + 30
    expect(t.byActivity[0]).toEqual({ activityId: 'tut', activityName: 'Tutoring', minutes: 150 });
    expect(t.byPerson.find((p) => p.uid === 'alice')?.minutes).toBe(180);
  });

  it('filters by person', async () => {
    const t = await computeTotals({ uid: 'bob', fromKey: '2026-07-01', toKey: '2026-07-31' });
    expect(t.totalMinutes).toBe(30);
  });

  it('filters by activity and date window', async () => {
    const t = await computeTotals({
      activityId: 'tut',
      fromKey: '2026-07-14',
      toKey: '2026-07-14',
    });
    expect(t.totalMinutes).toBe(30); // only Bob's tutoring that day
  });
});

describe('buildCsv', () => {
  it('emits a header + one row per closed entry, quoting commas, in work-local time', async () => {
    const csv = await buildCsv({ fromKey: '2026-07-01', toKey: '2026-07-31' });
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Person,Email hint,Activity,Date,Start,End');
    expect(lines).toHaveLength(4); // header + 3 closed entries
    // Alice's tutoring 14:00–16:00 UTC = 09:00–11:00 America/Chicago (CDT)
    const aliceTut = lines.find((l) => l.includes('Alice A.') && l.includes('Tutoring'));
    expect(aliceTut).toContain('09:00,11:00');
    expect(aliceTut).toContain('"with, comma"'); // comma-safe quoting
    expect(csv).not.toContain('20:00'); // running session excluded
  });
});
