import { httpsCallable } from 'firebase/functions';
import { type ReportFilter, type Totals } from '@sabeel/shared';
import { functions } from './firebase';

export type { ReportFilter, Totals };

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
