// Pure notification logic — no Firebase imports, unit-testable.
import {
  addDays,
  periodKeyFor,
  periodLabel,
  periodRangeFor,
  type NotifPrefs,
  type TimesheetStatus,
} from '@sabeel/shared';

/** Missing key = ON: nobody has to configure anything to get notified. */
export function prefOn(prefs: NotifPrefs | undefined, key: keyof NotifPrefs): boolean {
  return prefs?.[key] !== false;
}

/** Local weekday (0=Sun) and hour-of-day for an instant in an IANA timezone. */
export function localClock(nowMs: number, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date(nowMs));
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = names.indexOf(parts.find((p) => p.type === 'weekday')?.value ?? '');
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '-1') % 24;
  return { weekday, hour };
}

/** The reminder window: Tuesday 10:00–10:59 in the user's local time. */
export function inReminderWindow(nowMs: number, timeZone: string): boolean {
  const { weekday, hour } = localClock(nowMs, timeZone);
  return weekday === 2 && hour === 10;
}

/** The period the reminder is about: the one before the user's current period. */
export function reminderPeriod(todayKey: string): { fromKey: string; toKey: string } {
  return periodRangeFor(addDays(periodKeyFor(todayKey), -1));
}

/**
 * Whether last week actually needs a nudge. Submitted/approved sheets are done;
 * a rejected sheet needs resubmission; no sheet only matters when hours were
 * logged (an empty untouched week is not worth nagging about).
 */
export function reminderEligible(
  sheetStatus: TimesheetStatus | null,
  hasEntries: boolean,
): boolean {
  if (sheetStatus === 'submitted' || sheetStatus === 'approved') return false;
  if (sheetStatus === 'rejected') return true;
  return hasEntries;
}

export interface NotifText {
  title: string;
  body: string;
}

export const texts = {
  newUser: (name: string, email: string): NotifText => ({
    title: 'New account request',
    body: `${name} (${email}) is waiting for approval.`,
  }),
  submitted: (name: string, range: { fromKey: string; toKey: string }, resubmit: boolean): NotifText => ({
    title: resubmit ? 'Timesheet resubmitted' : 'Timesheet submitted',
    body: `${name} · ${periodLabel(range)}`,
  }),
  approved: (range: { fromKey: string; toKey: string }): NotifText => ({
    title: 'Timesheet approved',
    body: `Your timesheet for ${periodLabel(range)} was approved.`,
  }),
  rejected: (range: { fromKey: string; toKey: string }, reason: string): NotifText => ({
    title: 'Timesheet rejected',
    body: `${periodLabel(range)}: ${reason}`,
  }),
  reminder: (range: { fromKey: string; toKey: string }): NotifText => ({
    title: 'Timesheet reminder',
    body: `Last week (${periodLabel(range)}) hasn't been submitted yet.`,
  }),
};
