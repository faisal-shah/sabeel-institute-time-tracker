import { MAX_ENTRY_HOURS } from './constants';

export interface EntryTimes {
  start: number;
  end: number | null;
}

/**
 * Client-side validation mirroring firestore.rules: start before end, duration
 * positive and within the cap. Running sessions (end == null) only need a sane start.
 */
export function entryTimesValid({ start, end }: EntryTimes): boolean {
  if (!Number.isFinite(start) || start <= 0) return false;
  if (end === null) return true;
  if (!Number.isFinite(end)) return false;
  const minutes = (end - start) / 60000;
  return minutes > 0 && minutes <= MAX_ENTRY_HOURS * 60;
}
