import { describe, expect, it } from 'vitest';
import { overlappingEntryIds, type OverlapCheckEntry } from '../src/overlap';

const e = (
  id: string,
  dayKey: string,
  startH: number,
  endH: number | null,
): OverlapCheckEntry => ({
  id,
  dayKey,
  start: startH * 3_600_000,
  end: endH === null ? null : endH * 3_600_000,
});

describe('overlappingEntryIds', () => {
  it('flags strictly overlapping entries on the same day', () => {
    const out = overlappingEntryIds([e('a', '2026-07-13', 9, 11), e('b', '2026-07-13', 10, 12)]);
    expect(out).toEqual(new Set(['a', 'b']));
  });

  it('back-to-back entries (end == next start) are NOT conflicts', () => {
    const out = overlappingEntryIds([e('a', '2026-07-13', 13, 14), e('b', '2026-07-13', 14, 15)]);
    expect(out.size).toBe(0);
  });

  it('same times on different days are NOT conflicts', () => {
    const out = overlappingEntryIds([e('a', '2026-07-13', 9, 11), e('b', '2026-07-14', 9, 11)]);
    expect(out.size).toBe(0);
  });

  it('containment counts: an entry inside a longer one conflicts', () => {
    const out = overlappingEntryIds([e('a', '2026-07-13', 9, 17), e('b', '2026-07-13', 12, 13)]);
    expect(out).toEqual(new Set(['a', 'b']));
  });

  it('running entries are skipped', () => {
    const out = overlappingEntryIds([e('a', '2026-07-13', 9, null), e('b', '2026-07-13', 9, 11)]);
    expect(out.size).toBe(0);
  });

  it('three-way pileup flags all involved, leaves the clean one alone', () => {
    const out = overlappingEntryIds([
      e('a', '2026-07-13', 9, 12),
      e('b', '2026-07-13', 10, 11),
      e('c', '2026-07-13', 11, 13),
      e('d', '2026-07-13', 15, 16),
    ]);
    expect(out).toEqual(new Set(['a', 'b', 'c']));
  });
});
