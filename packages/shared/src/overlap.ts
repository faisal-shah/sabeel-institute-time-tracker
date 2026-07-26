/**
 * Overlapping-entry detection for a timesheet. Two entries conflict when their
 * time ranges strictly overlap — back-to-back entries (one ends exactly when the
 * next starts) are fine. Running entries (end === null) are provisional and never
 * flagged; a running session already blocks submission on its own.
 *
 * Compared on absolute instants, NOT within a dayKey bucket: an overnight shift
 * carries the dayKey of the day it STARTED, so grouping by day would miss a
 * 23:00–01:00 entry overlapping the next day's 00:30–02:00 one. Two entries that
 * overlap in real time are a conflict no matter which day each is filed under —
 * and that also makes the check correct across entries in different timezones.
 */
export interface OverlapCheckEntry {
  id: string;
  start: number;
  end: number | null;
}

/** Ids of every entry whose time range strictly overlaps another's. */
export function overlappingEntryIds(entries: OverlapCheckEntry[]): Set<string> {
  const conflicted = new Set<string>();
  const closed = entries.filter((e) => e.end !== null);
  closed.sort((a, b) => a.start - b.start);
  for (let i = 0; i < closed.length; i++) {
    // Sorted by start, so once a later entry starts at/after this one's end,
    // everything after it does too.
    for (let j = i + 1; j < closed.length && closed[j].start < (closed[i].end as number); j++) {
      conflicted.add(closed[i].id);
      conflicted.add(closed[j].id);
    }
  }
  return conflicted;
}
