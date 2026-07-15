import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface ReportFilter {
  uid?: string;
  activityId?: string;
  fromKey: string;
  toKey: string;
}

export interface Totals {
  totalMinutes: number;
  byActivity: { activityId: string; activityName: string; minutes: number }[];
  byPerson: { uid: string; displayName: string; minutes: number }[];
}

const exportCsvFn = httpsCallable<ReportFilter, { csv: string; filename: string }>(
  functions,
  'exportCsv',
);
const reportTotalsFn = httpsCallable<ReportFilter, Totals>(functions, 'reportTotals');

export async function fetchTotals(filter: ReportFilter): Promise<Totals> {
  const res = await reportTotalsFn(filter);
  return res.data;
}

export async function fetchCsv(filter: ReportFilter): Promise<{ csv: string; filename: string }> {
  const res = await exportCsvFn(filter);
  return res.data;
}

const syncDriveNowFn = httpsCallable<
  Record<string, never>,
  { skipped?: boolean; entryRows?: number; csvWritten?: string | null }
>(functions, 'syncDriveNow');

/** Kick the Drive sync now; user-friendly status string for the UI. */
export async function syncDriveNow(): Promise<string> {
  const { data } = await syncDriveNowFn({});
  if (data.skipped) {
    return 'Google Drive isn’t connected yet — an admin sets that up once (see setup notes).';
  }
  return `Synced ${data.entryRows ?? 0} entries to the shared Google Sheet.`;
}
