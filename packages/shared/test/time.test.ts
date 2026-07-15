import { describe, it, expect } from 'vitest';
import {
  dayKeyFor,
  timeOfDayFor,
  addDays,
  weekRange,
  monthRange,
  minutesBetween,
  formatDuration,
  weekdayIndex,
} from '../src/time';
import { entryTimesValid } from '../src/validate';

describe('dayKeyFor — work-local bucketing (the Singapore spec)', () => {
  // Mon 2026-07-13 09:00 in Singapore = Sun 2026-07-12 18:00 in California.
  const sgMonday9am = Date.UTC(2026, 6, 13, 1, 0); // SGT = UTC+8

  it('buckets a Singapore Monday-morning entry as Monday in Singapore', () => {
    expect(dayKeyFor(sgMonday9am, 'Asia/Singapore')).toBe('2026-07-13');
    expect(timeOfDayFor(sgMonday9am, 'Asia/Singapore')).toBe('09:00');
  });

  it('would be Sunday evening if (wrongly) viewed in California time', () => {
    // Documents exactly the confusion we avoid by bucketing in entry.timeZone.
    expect(dayKeyFor(sgMonday9am, 'America/Los_Angeles')).toBe('2026-07-12');
  });

  it('handles DST spring-forward day (US)', () => {
    // 2026-03-08 02:30 does not exist in America/Los_Angeles; an entry started
    // at 01:59 PST and one at 03:01 PDT are both March 8.
    const before = Date.UTC(2026, 2, 8, 9, 59); // 01:59 PST
    const after = Date.UTC(2026, 2, 8, 10, 1); // 03:01 PDT
    expect(dayKeyFor(before, 'America/Los_Angeles')).toBe('2026-03-08');
    expect(dayKeyFor(after, 'America/Los_Angeles')).toBe('2026-03-08');
  });

  it('handles DST fall-back day (US)', () => {
    // 2026-11-01: 01:30 happens twice in America/Los_Angeles.
    const first = Date.UTC(2026, 10, 1, 8, 30); // 01:30 PDT
    const second = Date.UTC(2026, 10, 1, 9, 30); // 01:30 PST
    expect(dayKeyFor(first, 'America/Los_Angeles')).toBe('2026-11-01');
    expect(dayKeyFor(second, 'America/Los_Angeles')).toBe('2026-11-01');
  });
});

describe('calendar arithmetic on dayKeys', () => {
  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29'); // leap year
  });

  it('weekdayIndex: Monday-start', () => {
    expect(weekdayIndex('2026-07-13')).toBe(0); // a Monday
    expect(weekdayIndex('2026-07-19')).toBe(6); // the following Sunday
  });

  it('weekRange returns the Monday..Sunday span containing the day', () => {
    expect(weekRange('2026-07-15')).toEqual({ fromKey: '2026-07-13', toKey: '2026-07-19' });
    expect(weekRange('2026-07-13')).toEqual({ fromKey: '2026-07-13', toKey: '2026-07-19' });
    expect(weekRange('2026-07-19')).toEqual({ fromKey: '2026-07-13', toKey: '2026-07-19' });
  });

  it('monthRange spans the whole month', () => {
    expect(monthRange('2026-02-11')).toEqual({ fromKey: '2026-02-01', toKey: '2026-02-28' });
    expect(monthRange('2028-02-11')).toEqual({ fromKey: '2028-02-01', toKey: '2028-02-29' });
  });
});

describe('durations and validation', () => {
  it('minutesBetween rounds to nearest minute', () => {
    expect(minutesBetween(0, 90 * 60000)).toBe(90);
    expect(minutesBetween(0, 90 * 60000 + 29000)).toBe(90);
    expect(minutesBetween(0, 90 * 60000 + 31000)).toBe(91);
  });

  it('formatDuration', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(125)).toBe('2h 05m');
    expect(formatDuration(600)).toBe('10h 00m');
  });

  it('entryTimesValid mirrors the rules', () => {
    const t = Date.UTC(2026, 6, 13, 9, 0);
    expect(entryTimesValid({ start: t, end: t + 60 * 60000 })).toBe(true);
    expect(entryTimesValid({ start: t, end: null })).toBe(true); // running
    expect(entryTimesValid({ start: t, end: t })).toBe(false); // zero length
    expect(entryTimesValid({ start: t, end: t - 1 })).toBe(false); // backwards
    expect(entryTimesValid({ start: t, end: t + 25 * 60 * 60000 })).toBe(false); // > 24h
  });
});
