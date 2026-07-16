import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Query } from 'firebase-admin/firestore';
import {
  addDays,
  formatDuration,
  timeOfDayFor,
  type TimeEntryDoc,
  type TimesheetDoc,
} from '@sabeel/shared';
import { requireManager } from './auth';
import { guarded, sentryDsn } from './sentry';

export interface ExportInput {
  uid?: string;
  activityId?: string;
  fromKey: string; // inclusive dayKey 'YYYY-MM-DD'
  toKey: string; // inclusive dayKey
  /** Official numbers count approved timesheets only; true includes the rest (unofficial view). */
  includeUnapproved?: boolean;
}

const KEY = /^\d{4}-\d{2}-\d{2}$/;

function validate(data: unknown): ExportInput {
  const d = data as Partial<ExportInput> | null;
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
export function entriesQuery(input: ExportInput): Query {
  let q: Query = getFirestore().collection('timeEntries');
  if (input.uid) q = q.where('uid', '==', input.uid);
  if (input.activityId) q = q.where('activityId', '==', input.activityId);
  q = q
    .where('dayKey', '>=', input.fromKey)
    .where('dayKey', '<=', input.toKey)
    .orderBy('dayKey');
  return q;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Closed entries (approved-only unless asked otherwise) → CSV, times rendered
 *  in each entry's own timezone. People show as name + email, never raw uids. */
export async function buildCsv(input: ExportInput): Promise<string> {
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

  const header = [
    'Person',
    'Email',
    'Activity',
    'Date',
    'Start',
    'End',
    'Timezone',
    'Hours',
    'Minutes',
    'Source',
    'Note',
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const e of rows) {
    lines.push(
      [
        people.get(e.uid)?.name ?? e.uid,
        people.get(e.uid)?.email ?? '',
        e.activityName,
        e.dayKey,
        timeOfDayFor(e.start, e.timeZone),
        timeOfDayFor(e.end as number, e.timeZone),
        e.timeZone,
        ((e.durationMinutes ?? 0) / 60).toFixed(2),
        e.durationMinutes ?? 0,
        e.source,
        e.note ?? '',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}

export interface Totals {
  totalMinutes: number;
  byActivity: { activityId: string; activityName: string; minutes: number }[];
  byPerson: { uid: string; minutes: number }[];
}

/** In-memory rollups for dashboards over the same filtered set. */
export async function computeTotals(input: ExportInput): Promise<Totals> {
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
  return {
    totalMinutes: total,
    byActivity: [...act.entries()]
      .map(([activityId, v]) => ({ activityId, ...v }))
      .sort((a, b) => b.minutes - a.minutes),
    byPerson: [...per.entries()]
      .map(([uid, minutes]) => ({ uid, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
  };
}

export const exportCsv = onCall(
  { secrets: [sentryDsn] },
  guarded(async (req) => {
    requireManager(req);
    const input = validate(req.data);
    const csv = await buildCsv(input);
    const suffix = input.includeUnapproved ? '_unofficial' : '';
    return { csv, filename: `hours_${input.fromKey}_to_${input.toKey}${suffix}.csv` };
  }),
);

export const reportTotals = onCall(
  { secrets: [sentryDsn] },
  guarded(async (req) => {
    requireManager(req);
    const input = validate(req.data);
    const totals = await computeTotals(input);
    // Attach display names so the dashboard shows people, not uids.
    const names = new Map<string, string>();
    await Promise.all(
      totals.byPerson.map(async (p) => {
        const u = await getFirestore().collection('users').doc(p.uid).get();
        names.set(p.uid, (u.data()?.displayName as string) ?? p.uid);
      }),
    );
    return {
      ...totals,
      byPerson: totals.byPerson.map((p) => ({ ...p, displayName: names.get(p.uid) ?? p.uid })),
    };
  }),
);

// Re-exported so callers importing from one module get a stable surface.
export { formatDuration };
