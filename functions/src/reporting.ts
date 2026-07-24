import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Query } from 'firebase-admin/firestore';
import {
  addDays,
  REPORT_COLUMNS,
  reportRow,
  type ReportFilter,
  type Totals,
  type TimeEntryDoc,
  type TimesheetDoc,
} from '@sabeel/shared';
import { requireManagerOrAdmin } from './auth';
import { guarded, sentryDsn } from './sentry';

const KEY = /^\d{4}-\d{2}-\d{2}$/;

function validate(data: unknown): ReportFilter {
  const d = data as Partial<ReportFilter> | null;
  if (!d || !KEY.test(d.fromKey ?? '') || !KEY.test(d.toKey ?? '')) {
    throw new HttpsError('invalid-argument', 'fromKey and toKey must be YYYY-MM-DD.');
  }
  if (d.fromKey! > d.toKey!) {
    throw new HttpsError('invalid-argument', 'fromKey must be on or before toKey.');
  }
  return {
    fromKey: d.fromKey!,
    toKey: d.toKey!,
    ...(typeof d.uid === 'string' ? { uid: d.uid } : {}),
    ...(typeof d.activityId === 'string' ? { activityId: d.activityId } : {}),
    ...(d.includeUnapproved === true ? { includeUnapproved: true } : {}),
  };
}

/**
 * Ids (`${uid}_${periodKey}`) of APPROVED timesheets whose period overlaps the
 * inclusive [fromKey, toKey] dayKey range. Periods span at most 7 days, so a
 * period overlapping the range must start no earlier than fromKey-6.
 */
export async function approvedPeriodSet(fromKey: string, toKey: string): Promise<Set<string>> {
  const snap = await getFirestore()
    .collection('timesheets')
    .where('status', '==', 'approved')
    .where('periodKey', '>=', addDays(fromKey, -6))
    .where('periodKey', '<=', toKey)
    .get();
  return new Set(
    snap.docs.filter((d) => (d.data() as TimesheetDoc).toKey >= fromKey).map((d) => d.id),
  );
}

/** Keep only entries covered by an approved timesheet (the official view). */
function approvedOnly(rows: TimeEntryDoc[], approved: Set<string>): TimeEntryDoc[] {
  return rows.filter((e) => approved.has(`${e.uid}_${e.periodKey}`));
}

/** Build the filtered, dayKey-ordered query shared by CSV export and Drive sync. */
function entriesQuery(input: ReportFilter): Query {
  let q: Query = getFirestore().collection('timeEntries');
  if (input.uid) q = q.where('uid', '==', input.uid);
  if (input.activityId) q = q.where('activityId', '==', input.activityId);
  q = q
    .where('dayKey', '>=', input.fromKey)
    .where('dayKey', '<=', input.toKey)
    .orderBy('dayKey');
  return q;
}

export function csvCell(v: string | number): string {
  let s = String(v);
  // CSV formula injection: a cell a spreadsheet reads as starting with = + - @
  // (or a leading tab/CR) is executed as a formula when the file is opened in
  // Excel. Neutralize by prefixing a single quote — the live Google Sheet is
  // safe already (written with valueInputOption RAW); this guards the CSV file
  // and the downloaded export. User-controlled fields: note, activity, name.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Closed entries (approved-only unless asked otherwise) → CSV, times rendered
 *  in each entry's own timezone. People show as name + email, never raw uids. */
export async function buildCsv(input: ReportFilter): Promise<string> {
  const snap = await entriesQuery(input).get();
  let rows = snap.docs
    .map((d) => d.data() as TimeEntryDoc)
    .filter((e) => e.end !== null); // running sessions excluded
  if (!input.includeUnapproved) {
    rows = approvedOnly(rows, await approvedPeriodSet(input.fromKey, input.toKey));
  }

  const uids = [...new Set(rows.map((e) => e.uid))];
  const people = new Map<string, { name: string; email: string }>();
  await Promise.all(
    uids.map(async (uid) => {
      const u = await getFirestore().collection('users').doc(uid).get();
      people.set(uid, {
        name: (u.data()?.displayName as string) ?? uid,
        email: (u.data()?.email as string) ?? '',
      });
    }),
  );

  const lines = [REPORT_COLUMNS.map(csvCell).join(',')];
  for (const e of rows) {
    const person = people.get(e.uid) ?? { name: e.uid, email: '' };
    lines.push(reportRow(e, person).map(csvCell).join(','));
  }
  return lines.join('\n');
}

/** In-memory rollups for dashboards over the same filtered set. `byPerson` is
 *  resolved to display names here so the wire shape (shared `Totals`) is whole. */
export async function computeTotals(input: ReportFilter): Promise<Totals> {
  const snap = await entriesQuery(input).get();
  let rows = snap.docs.map((d) => d.data() as TimeEntryDoc).filter((e) => e.end !== null);
  if (!input.includeUnapproved) {
    rows = approvedOnly(rows, await approvedPeriodSet(input.fromKey, input.toKey));
  }

  const act = new Map<string, { activityName: string; minutes: number }>();
  const per = new Map<string, number>();
  let total = 0;
  for (const e of rows) {
    const m = e.durationMinutes ?? 0;
    total += m;
    const a = act.get(e.activityId) ?? { activityName: e.activityName, minutes: 0 };
    a.minutes += m;
    act.set(e.activityId, a);
    per.set(e.uid, (per.get(e.uid) ?? 0) + m);
  }

  // Resolve display names so the dashboard shows people, not uids.
  const names = new Map<string, string>();
  await Promise.all(
    [...per.keys()].map(async (uid) => {
      const u = await getFirestore().collection('users').doc(uid).get();
      names.set(uid, (u.data()?.displayName as string) ?? uid);
    }),
  );

  return {
    totalMinutes: total,
    byActivity: [...act.entries()]
      .map(([activityId, v]) => ({ activityId, ...v }))
      .sort((a, b) => b.minutes - a.minutes),
    byPerson: [...per.entries()]
      .map(([uid, minutes]) => ({ uid, displayName: names.get(uid) ?? uid, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
  };
}

export const exportCsv = onCall(
  { secrets: [sentryDsn] },
  guarded(async (req) => {
    requireManagerOrAdmin(req);
    const input = validate(req.data);
    const csv = await buildCsv(input);
    const suffix = input.includeUnapproved ? '_unofficial' : '';
    return { csv, filename: `hours_${input.fromKey}_to_${input.toKey}${suffix}.csv` };
  }),
);

export const reportTotals = onCall(
  { secrets: [sentryDsn] },
  guarded(async (req) => {
    requireManagerOrAdmin(req);
    return computeTotals(validate(req.data));
  }),
);

