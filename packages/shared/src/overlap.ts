/**
 * Overlapping-entry detection for a timesheet. Two entries conflict when they
 * are on the same day and their time ranges strictly overlap — back-to-back
 * entries (one ends exactly when the next starts) are fine. Running entries
 * (end === null) are provisional and never flagged; a running session already
 * blocks submission on its own.
 */
export interface OverlapCheckEntry {
  id: string;
  dayKey: string;
  start: number;
  end: number | null;
}

/** Ids of every entry that strictly overlaps another entry on the same day. */
export function overlappingEntryIds(entries: OverlapCheckEntry[]): Set<string> {
  const conflicted = new Set<string>();
  const byDay = new Map<string, OverlapCheckEntry[]>();
  for (const e of entries) {
    if (e.end === null) continue;
    const group = byDay.get(e.dayKey) ?? [];
    group.push(e);
    byDay.set(e.dayKey, group);
  }
  for (const group of byDay.values()) {
    group.sort((a, b) => a.start - b.start);
    for (let i = 0; i < group.length; i++) {
      // Sorted by start, so once a later entry starts at/after this one's end,
      // everything after it does too.
      for (let j = i + 1; j < group.length && group[j].start < (group[i].end as number); j++) {
        conflicted.add(group[i].id);
        conflicted.add(group[j].id);
      }
    }
  }
  return conflicted;
}
