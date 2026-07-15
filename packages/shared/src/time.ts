// All timezone math goes through these helpers, on every surface, so buckets
// always agree. Entries are bucketed in the timezone where the work happened
// (entry.timeZone), never the viewer's. Built on Intl — no date library.

/** IANA timezone of the current device. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** 'YYYY-MM-DD' of an instant in a given IANA timezone. */
export function dayKeyFor(epochMs: number, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(epochMs));
}

/** 'HH:MM' (24h) of an instant in a given IANA timezone. */
export function timeOfDayFor(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(epochMs));
}

/** Short timezone label (e.g. 'PDT', 'GMT+8') for display next to times. */
export function tzLabelFor(epochMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(new Date(epochMs));
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** dayKey → {y, m, d} numbers. */
export function parseDayKey(dayKey: string): { y: number; m: number; d: number } {
  const [y, m, d] = dayKey.split('-').map(Number);
  return { y, m, d };
}

/** The dayKey n days after the given one (calendar arithmetic, tz-independent). */
export function addDays(dayKey: string, n: number): string {
  const { y, m, d } = parseDayKey(dayKey);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** 0 = Monday … 6 = Sunday for a dayKey. */
export function weekdayIndex(dayKey: string): number {
  const { y, m, d } = parseDayKey(dayKey);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/**
 * The Monday-start week containing a dayKey, as an inclusive dayKey range.
 * Weeks are calendar constructs on local dates, so this needs no timezone.
 */
export function weekRange(dayKey: string): { fromKey: string; toKey: string } {
  const fromKey = addDays(dayKey, -weekdayIndex(dayKey));
  return { fromKey, toKey: addDays(fromKey, 6) };
}

/** The month containing a dayKey, as an inclusive dayKey range. */
export function monthRange(dayKey: string): { fromKey: string; toKey: string } {
  const { y, m } = parseDayKey(dayKey);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { fromKey: `${y}-${pad(m)}-01`, toKey: `${y}-${pad(m)}-${pad(lastDay)}` };
}

/** Whole minutes between two instants, rounded to the nearest minute. */
export function minutesBetween(startMs: number, endMs: number): number {
  return Math.round((endMs - startMs) / 60000);
}

/** 125 → '2h 05m'; 45 → '45m'. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${pad(m)}m`;
}
