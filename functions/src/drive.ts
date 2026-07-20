import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { monthRange, type TimeEntryDoc } from '@sabeel/shared';
import { requireManager } from './auth';
import { guarded, reportError, sentryDsn } from './sentry';
import { approvedPeriodSet, buildCsv } from './reporting';
import {
  entriesGrid,
  personSummaryGrid,
  activityMonthGrid,
  type PeopleMap,
  type Row,
} from './driveRows';

// Drive target config comes from plain env vars (functions/.env for deploy; see
// TODO.md). Deliberately NOT firebase-functions `defineString` params: those make
// the Functions emulator block on an interactive stdin prompt when unset, which
// hangs headless runs. Empty = sync is a safe no-op.
const driveSpreadsheetId = () => process.env.DRIVE_SPREADSHEET_ID ?? '';
const driveFolderId = () => process.env.DRIVE_FOLDER_ID ?? '';

/** Everything the sync needs from Google, behind a seam so tests can mock it. */
export interface DriveTarget {
  /** Replace a tab's contents with the given grid (creating the tab if needed). */
  writeSheet(tabName: string, rows: Row[]): Promise<void>;
  /** Upload/replace a CSV file by name in the shared folder. */
  writeCsvFile(name: string, csv: string): Promise<void>;
}

export interface SyncResult {
  skipped?: boolean;
  entryRows?: number;
  csvWritten?: string | null;
}

/**
 * Load the full history of APPROVED entries (admin SDK bypasses rules) for the
 * Sheet — Drive is the official record, so it never shows unapproved hours.
 */
async function allEntries(): Promise<{ entries: TimeEntryDoc[]; people: PeopleMap }> {
  const db = getFirestore();
  const [snap, approved] = await Promise.all([
    db.collection('timeEntries').orderBy('dayKey').get(),
    approvedPeriodSet('2000-01-01', '2999-12-31'),
  ]);
  const entries = snap.docs
    .map((d) => d.data() as TimeEntryDoc)
    .filter((e) => approved.has(`${e.uid}_${e.periodKey}`));
  const uids = [...new Set(entries.map((e) => e.uid))];
  const people: PeopleMap = new Map();
  await Promise.all(
    uids.map(async (uid) => {
      const u = await db.collection('users').doc(uid).get();
      people.set(uid, {
        name: (u.data()?.displayName as string) ?? uid,
        email: (u.data()?.email as string) ?? '',
      });
    }),
  );
  return { entries, people };
}

/** Core sync, target injected so tests drive it without real Google APIs.
 *  monthToSnapshot (YYYY-MM) also drops that month's CSV into the folder. */
export async function runSync(
  target: DriveTarget | null,
  opts: { monthToSnapshot?: string } = {},
): Promise<SyncResult> {
  if (!target) return { skipped: true };

  const { entries, people } = await allEntries();
  await target.writeSheet('Entries', entriesGrid(entries, people));
  await target.writeSheet('By person', personSummaryGrid(entries, people));
  await target.writeSheet('By activity & month', activityMonthGrid(entries));

  let csvWritten: string | null = null;
  if (opts.monthToSnapshot) {
    const { fromKey, toKey } = monthRange(`${opts.monthToSnapshot}-01`);
    const csv = await buildCsv({ fromKey, toKey });
    const name = `hours-${opts.monthToSnapshot}.csv`;
    await target.writeCsvFile(name, csv);
    csvWritten = name;
  }
  return { entryRows: entries.length, csvWritten };
}

/** Real Google target from the service-account ADC (set on the deployed function).
 *  googleapis is a heavy module, so it's require()d lazily here — importing this
 *  file must NOT drag googleapis into every function's cold start. */
function makeGoogleTarget(spreadsheetId: string, folderId: string): DriveTarget | null {
  if (!spreadsheetId || !folderId) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { google } = require('googleapis') as typeof import('googleapis');
  const auth = new google.auth.GoogleAuth({
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  return {
    async writeSheet(tabName, rows) {
      // Ensure the tab exists.
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      const exists = meta.data.sheets?.some((s) => s.properties?.title === tabName);
      if (!exists) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
        });
      }
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: tabName });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      });
    },
    async writeCsvFile(name, csv) {
      const existing = await drive.files.list({
        q: `name='${name}' and '${folderId}' in parents and trashed=false`,
        fields: 'files(id)',
      });
      const media = { mimeType: 'text/csv', body: csv };
      const found = existing.data.files?.[0]?.id;
      if (found) {
        await drive.files.update({ fileId: found, media });
      } else {
        await drive.files.create({
          requestBody: { name, parents: [folderId] },
          media,
        });
      }
    },
  };
}

function currentTarget(): DriveTarget | null {
  return makeGoogleTarget(driveSpreadsheetId(), driveFolderId());
}

/** Nightly at 02:15; on the 1st, also snapshot the prior month to CSV. */
export const syncToDrive = onSchedule(
  { schedule: '15 2 * * *', secrets: [sentryDsn] },
  async () => {
    try {
      const now = new Date();
      let monthToSnapshot: string | undefined;
      if (now.getUTCDate() === 1) {
        const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        monthToSnapshot = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
      }
      await runSync(currentTarget(), { monthToSnapshot });
    } catch (e) {
      await reportError(e);
      throw e;
    }
  },
);

/** Manager "sync now" button. */
export const syncDriveNow = onCall(
  { secrets: [sentryDsn] },
  guarded(async (req) => {
    requireManager(req);
    return runSync(currentTarget());
  }),
);
