import { describe, it, expect } from 'vitest';
import { entriesGrid, personSummaryGrid, activityMonthGrid } from '../../src/driveRows';
import type { TimeEntryDoc } from '@sabeel/shared';

const T = (dayKey: string, h: number) => {
  const [y, m, d] = dayKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d, h, 0);
};

function entry(over: Partial<TimeEntryDoc>): TimeEntryDoc {
  return {
    uid: 'alice',
    activityId: 'tut',
    activityName: 'Tutoring',
    start: T('2026-07-13', 14),
    end: T('2026-07-13', 16),
    durationMinutes: 120,
    timeZone: 'America/Chicago',
    dayKey: '2026-07-13',
    source: 'manual',
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

const names = new Map([
  ['alice', 'Alice A.'],
  ['bob', 'Bob B.'],
]);

describe('driveRows builders', () => {
  const data = [
    entry({}),
    entry({ uid: 'bob', dayKey: '2026-08-01', start: T('2026-08-01', 18), end: T('2026-08-01', 19), durationMinutes: 60 }),
    entry({ activityId: 'fd', activityName: 'Food Drive', dayKey: '2026-08-05', durationMinutes: 30, start: T('2026-08-05', 9), end: T('2026-08-05', 9) }),
    entry({ end: null, durationMinutes: undefined, dayKey: '2026-08-10' }), // running — excluded
  ];

  it('entriesGrid: header + one row per closed entry, work-local times', () => {
    const g = entriesGrid(data, names);
    expect(g[0][0]).toBe('Person');
    expect(g).toHaveLength(4); // header + 3 closed
    // 14:00 UTC on 2026-07-13 = 09:00 America/Chicago (CDT)
    expect(g[1]).toContain('09:00');
    expect(g[1][7]).toBe(2); // hours
  });

  it('personSummaryGrid: totals per person, highest first', () => {
    const g = personSummaryGrid(data, names);
    expect(g[0]).toEqual(['Person', 'Total hours']);
    // Alice: 120 + 30 = 150m = 2.5h; Bob: 60m = 1h
    expect(g[1]).toEqual(['Alice A.', 2.5]);
    expect(g[2]).toEqual(['Bob B.', 1]);
  });

  it('activityMonthGrid: per activity per month', () => {
    const g = activityMonthGrid(data);
    expect(g[0]).toEqual(['Activity', 'Month', 'Hours']);
    // Food Drive 2026-08 = 0.5h; Tutoring 2026-07 = 2h; Tutoring 2026-08 = 1h
    expect(g).toContainEqual(['Food Drive', '2026-08', 0.5]);
    expect(g).toContainEqual(['Tutoring', '2026-07', 2]);
    expect(g).toContainEqual(['Tutoring', '2026-08', 1]);
  });
});
