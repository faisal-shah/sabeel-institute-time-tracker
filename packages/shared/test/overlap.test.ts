import { describe, expect, it } from 'vitest';
import { overlappingEntryIds, type OverlapCheckEntry } from '../src/overlap';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** `day` is a day index; hours may exceed 24 to express an overnight span. */
const e = (id: string, day: number, startH: number, endH: number | null): OverlapCheckEntry => ({
  id,
  start: day * DAY + startH * HOUR,
  end: endH === null ? null : day * DAY + endH * HOUR,
});

describe('overlappingEntryIds', () => {
  it('flags strictly overlapping entries', () => {
    expect(overlappingEntryIds([e('a', 1, 9, 11), e('b', 1, 10, 12)])).toEqual(
      new Set(['a', 'b']),
    );
  });

  it('back-to-back entries (end == next start) are NOT conflicts', () => {
    expect(overlappingEntryIds([e('a', 1, 13, 14), e('b', 1, 14, 15)]).size).toBe(0);
  });

  it('same wall-clock times on different days are NOT conflicts', () => {
    expect(overlappingEntryIds([e('a', 1, 9, 11), e('b', 2, 9, 11)]).size).toBe(0);
  });

  it('containment counts: an entry inside a longer one conflicts', () => {
    expect(overlappingEntryIds([e('a', 1, 9, 17), e('b', 1, 12, 13)])).toEqual(
      new Set(['a', 'b']),
    );
  });

  it('running entries are skipped', () => {
    expect(overlappingEntryIds([e('a', 1, 9, null), e('b', 1, 9, 11)]).size).toBe(0);
  });

  it('three-way pileup flags all involved, leaves the clean one alone', () => {
    const out = overlappingEntryIds([
      e('a', 1, 9, 12),
      e('b', 1, 10, 11),
      e('c', 1, 11, 13),
      e('d', 1, 15, 16),
    ]);
    expect(out).toEqual(new Set(['a', 'b', 'c']));
  });

  // The reason this compares absolute instants instead of grouping by dayKey: an
  // overnight entry is filed under the day it STARTED, so a per-day check could
  // never see it collide with the following morning.
  it('flags an overnight entry against the next morning (different dayKeys)', () => {
    const overnight = e('night', 1, 22, 30); // 22:00 → 06:00 next day
    const morning = e('morning', 2, 0.5, 2); // 00:30 → 02:00
    expect(overlappingEntryIds([overnight, morning])).toEqual(new Set(['night', 'morning']));
  });

  it('an overnight entry that ends before the next one starts is clean', () => {
    const overnight = e('night', 1, 22, 26); // 22:00 → 02:00
    const morning = e('morning', 2, 6, 8);
    expect(overlappingEntryIds([overnight, morning]).size).toBe(0);
  });
});
