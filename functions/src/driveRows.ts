// Pure builders for the Google Drive outputs — no I/O, so they unit-test cleanly.
// The live Sheet gets an "Entries" grid plus summary grids; the monthly CSV
// snapshot reuses buildCsv. All times render in each entry's own timezone.
import { REPORT_COLUMNS, reportRow, type TimeEntryDoc } from '@sabeel/shared';

export type Row = (string | number)[];

/** displayName + email per uid — the Sheet shows people, never raw uids. */
export type PeopleMap = Map<string, { name: string; email: string }>;

/** Closed entries → grid rows for the Sheet's "Entries" tab. Header + per-entry
 *  projection come from @sabeel/shared, shared with the CSV export. */
export function entriesGrid(entries: TimeEntryDoc[], people: PeopleMap): Row[] {
  const rows: Row[] = [[...REPORT_COLUMNS]];
  for (const e of entries) {
    if (e.end === null) continue; // running sessions excluded
    const person = people.get(e.uid) ?? { name: e.uid, email: '' };
    rows.push(reportRow(e, person));
  }
  return rows;
}

/** Per-person lifetime totals (hours), highest first. */
export function personSummaryGrid(entries: TimeEntryDoc[], people: PeopleMap): Row[] {
  const per = new Map<string, number>();
  for (const e of entries) {
    if (e.end === null) continue;
    per.set(e.uid, (per.get(e.uid) ?? 0) + (e.durationMinutes ?? 0));
  }
  const rows: Row[] = [['Person', 'Total hours']];
  [...per.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([uid, minutes]) =>
      rows.push([people.get(uid)?.name ?? uid, Number((minutes / 60).toFixed(2))]),
    );
  return rows;
}

/** Per-activity per-month totals (hours). */
export function activityMonthGrid(entries: TimeEntryDoc[]): Row[] {
  const key = (a: string, m: string) => `${a}\u0000${m}`;
  const cells = new Map<string, { activity: string; month: string; minutes: number }>();
  for (const e of entries) {
    if (e.end === null) continue;
    const month = e.dayKey.slice(0, 7); // YYYY-MM
    const k = key(e.activityName, month);
    const cur = cells.get(k) ?? { activity: e.activityName, month, minutes: 0 };
    cur.minutes += e.durationMinutes ?? 0;
    cells.set(k, cur);
  }
  const rows: Row[] = [['Activity', 'Month', 'Hours']];
  [...cells.values()]
    .sort((a, b) => a.activity.localeCompare(b.activity) || a.month.localeCompare(b.month))
    .forEach((c) => rows.push([c.activity, c.month, Number((c.minutes / 60).toFixed(2))]));
  return rows;
}
