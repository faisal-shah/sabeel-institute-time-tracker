import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  addDays,
  dayKeyFor,
  deviceTimeZone,
  formatDuration,
  monthLabel,
  periodHasStarted,
  periodLabel,
  periodRangeFor,
  periodsOfMonth,
  timeOfDayFor,
  tzLabelFor,
  type TokenClaims,
  type UserDoc,
} from '@sabeel/shared';
import type { RootStackParamList } from '../nav';
import { confirmAction } from '../confirm';
import { copyPeriodEntries, useEntriesRange, useEntryPeriods, type TimeEntry } from '../entries';
import {
  submitTimesheet,
  resubmitTimesheet,
  withdrawTimesheet,
  reopenTimesheet,
  useTimesheet,
  useMyTimesheetsRange,
} from '../timesheets';
import { Button, ErrorText, Screen } from '../components/ui';
import { colors, spacing } from '../theme';

export function EntryRow({ entry, onPress }: { entry: TimeEntry; onPress: () => void }) {
  const deviceTz = deviceTimeZone();
  const foreign = entry.timeZone !== deviceTz;
  const times =
    entry.end === null
      ? `${timeOfDayFor(entry.start, entry.timeZone)} — running`
      : `${timeOfDayFor(entry.start, entry.timeZone)}–${timeOfDayFor(entry.end, entry.timeZone)}`;
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowActivity}>{entry.activityName}</Text>
        <Text style={styles.rowTimes}>
          {times}
          {foreign ? ` (${tzLabelFor(entry.start, entry.timeZone)})` : ''}
          {entry.source === 'manual' ? ' · manual' : ''}
          {entry.autoClosed ? ' · auto-closed' : ''}
          {entry.lastEditedBy ? ' · corrected' : ''}
        </Text>
        {entry.note ? (
          <Text style={styles.rowNote} numberOfLines={1}>
            {entry.note}
          </Text>
        ) : null}
      </View>
      <Text style={styles.rowDuration}>
        {entry.durationMinutes != null ? formatDuration(entry.durationMinutes) : '…'}
      </Text>
    </Pressable>
  );
}

const STATUS_CHIP = {
  draft: { label: 'Not submitted', color: colors.textMuted },
  submitted: { label: 'Submitted', color: colors.accentDeep },
  approved: { label: 'Approved', color: colors.primary },
  rejected: { label: 'Rejected', color: colors.danger },
} as const;

export function TimesheetScreen({
  uid,
  profile,
  claims,
  initialPeriodKey,
}: {
  uid: string;
  profile: UserDoc;
  claims: TokenClaims;
  /** Open anchored at this week (rejection resolution jumps straight there). */
  initialPeriodKey?: string;
}) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tz = deviceTimeZone();
  const todayKey = dayKeyFor(Date.now(), tz);
  const [anchor, setAnchor] = useState(initialPeriodKey ?? todayKey);
  const [error, setError] = useState<string | null>(null);

  const period = periodRangeFor(anchor);
  const entries = useEntriesRange(uid, period.fromKey, period.toKey);
  const sheet = useTimesheet(uid, period.fromKey);
  const status = sheet === undefined ? undefined : (sheet?.status ?? 'draft');

  // Month strip: this month's periods with their submission states.
  const month = useMemo(() => periodsOfMonth(anchor), [anchor]);
  const monthSheets = useMyTimesheetsRange(uid, month[0].fromKey, month[month.length - 1].fromKey);
  const sheetByPeriod = useMemo(
    () => new Map(monthSheets.map((t) => [t.periodKey, t])),
    [monthSheets],
  );
  // Which weeks have hours logged (for the "in progress, not submitted" dot).
  const periodsWithHours = useEntryPeriods(
    uid,
    month[0].fromKey,
    month[month.length - 1].toKey,
  );

  const total = useMemo(
    () => entries.reduce((s, e) => s + (e.durationMinutes ?? 0), 0),
    [entries],
  );
  const byDay = useMemo(() => {
    const groups = new Map<string, TimeEntry[]>();
    for (const e of entries) {
      const g = groups.get(e.dayKey) ?? [];
      g.push(e);
      groups.set(e.dayKey, g);
    }
    return [...groups.entries()];
  }, [entries]);

  // Arrows step MONTHS (weeks are picked via the chips): back lands on the last
  // week of the previous month, forward on the first week of the next.
  const stepMonth = (dir: 1 | -1) =>
    setAnchor(
      dir === -1 ? addDays(month[0].fromKey, -1) : addDays(month[month.length - 1].toKey, 1),
    );

  // Submission preconditions (rules enforce them too; these make the UI honest).
  const approverUid = profile.approverUid ?? (claims.admin ? uid : null);
  const hasRunningInPeriod = entries.some((e) => e.end === null);
  const started = periodHasStarted(period.fromKey, todayKey);

  const act = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <Text style={styles.monthTitle}>{monthLabel(period.fromKey)}</Text>
      {/* Week navigator for the month — a chip per week, flanked by month
          arrows. Dots tell the story: sage = hours logged but not submitted,
          gold = submitted, raspberry = approved, red = rejected; no dot =
          empty week. Future weeks are dim. */}
      <View style={styles.stripRow}>
        <Button label="‹" kind="secondary" onPress={() => stepMonth(-1)} />
        <View style={styles.monthStrip}>
        {month.map((p) => {
          const st = p.fromKey === period.fromKey && sheet !== undefined
            ? (sheet?.status ?? 'draft')
            : (sheetByPeriod.get(p.fromKey)?.status ?? 'draft');
          const on = p.fromKey === period.fromKey;
          const future = !periodHasStarted(p.fromKey, todayKey);
          const dotColor =
            st !== 'draft'
              ? STATUS_CHIP[st].color
              : periodsWithHours.has(p.fromKey)
                ? colors.sage
                : null;
          return (
            <Pressable
              key={p.fromKey}
              onPress={() => setAnchor(p.fromKey)}
              style={[styles.monthChip, on && styles.monthChipOn, future && styles.monthChipFuture]}
            >
              {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
              <Text style={[styles.monthChipLabel, on && styles.monthChipLabelOn]}>
                {periodLabel(p)}
              </Text>
            </Pressable>
          );
        })}
        </View>
        <Button label="›" kind="secondary" onPress={() => stepMonth(1)} />
      </View>
      <View style={styles.legend}>
        {(
          [
            [colors.sage, 'in progress'],
            [STATUS_CHIP.submitted.color, 'submitted'],
            [STATUS_CHIP.approved.color, 'approved'],
            [STATUS_CHIP.rejected.color, 'rejected'],
          ] as const
        ).map(([c, label]) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: c }]} />
            <Text style={styles.legendLabel}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.summaryRow}>
        <Text style={styles.navTotal}>Week total: {formatDuration(total)}</Text>
        {status && status !== 'draft' ? (
          <Text style={[styles.statusChip, { color: STATUS_CHIP[status].color }]}>
            {STATUS_CHIP[status].label}
          </Text>
        ) : null}
      </View>
      {periodRangeFor(todayKey).fromKey !== period.fromKey ? (
        <Button label="Jump to current week" kind="secondary" onPress={() => setAnchor(todayKey)} />
      ) : null}

      {sheet?.status === 'rejected' ? (
        <View style={styles.rejectCard}>
          <Text style={styles.rejectTitle}>Rejected</Text>
          <Text style={styles.rejectReason}>{sheet.rejectReason}</Text>
          <Text style={styles.rejectHint}>
            Fix the entries below, then resubmit for approval.
          </Text>
        </View>
      ) : null}

      {byDay.map(([dayKey, dayEntries]) => (
        <View key={dayKey} style={styles.dayGroup}>
          <Text style={styles.dayHeader}>
            {dayKey} ·{' '}
            {formatDuration(dayEntries.reduce((s, e) => s + (e.durationMinutes ?? 0), 0))}
          </Text>
          {dayEntries.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              onPress={() => (e.end !== null ? nav.navigate('EntryEdit', { entryId: e.id }) : null)}
            />
          ))}
        </View>
      ))}
      {entries.length === 0 && <Text style={styles.empty}>No hours in this week.</Text>}

      {status === 'draft' && !started ? (
        <Text style={styles.hint}>
          This week hasn't started yet — there's nothing to submit. Timesheets exist
          only once you submit them.
        </Text>
      ) : null}
      {status === 'draft' && started ? (
        <>
          {entries.length === 0 ? (
            <Button
              label="Copy last week's hours"
              kind="secondary"
              onPress={() =>
                act(async () => {
                  const prev = periodRangeFor(addDays(period.fromKey, -1));
                  if (
                    !(await confirmAction(
                      'Copy last week?',
                      `Copies every entry from ${periodLabel(prev)} into this week (same days, same times). You can edit or delete them afterwards.`,
                    ))
                  )
                    return;
                  const { copied, skipped } = await copyPeriodEntries(uid, prev, period);
                  if (copied === 0) throw new Error('Last week has no entries to copy.');
                  if (skipped > 0)
                    throw new Error(
                      `Copied ${copied}; skipped ${skipped} that fall outside this (shorter) week.`,
                    );
                })
              }
            />
          ) : null}
          {!approverUid ? (
            <Text style={styles.hint}>Pick your timesheet approver on the home screen first.</Text>
          ) : null}
          {hasRunningInPeriod ? (
            <Text style={styles.hint}>Clock out before submitting this week.</Text>
          ) : null}
          <Button
            label={total === 0 ? 'Submit timesheet (no hours)' : 'Submit timesheet'}
            onPress={() => act(() => submitTimesheet(uid, period, approverUid!, entries))}
            disabled={!approverUid || hasRunningInPeriod}
          />
        </>
      ) : null}
      {sheet && sheet.status === 'submitted' ? (
        <Button
          label="Withdraw submission"
          kind="secondary"
          onPress={() => act(() => withdrawTimesheet(sheet))}
        />
      ) : null}
      {sheet && sheet.status === 'rejected' ? (
        <Button
          label="Resubmit timesheet"
          onPress={() => act(() => resubmitTimesheet(sheet, approverUid!, entries))}
          disabled={!approverUid || hasRunningInPeriod}
        />
      ) : null}
      {sheet && sheet.status === 'approved' ? (
        <>
          <Text style={styles.hint}>
            Approved — this week is locked. Only an admin can reopen it.
          </Text>
          {claims.admin ? (
            <Button
              label="Reopen (admin)"
              kind="danger"
              onPress={() => act(() => reopenTimesheet(sheet))}
            />
          ) : null}
        </>
      ) : null}
      <ErrorText error={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  monthTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  stripRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  monthStrip: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  monthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1.5),
  },
  monthChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  monthChipFuture: { opacity: 0.45 },
  monthChipLabel: { fontSize: 12, color: colors.textMuted },
  monthChipLabelOn: { color: colors.onPrimary },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3), marginTop: spacing(1) },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing(1) },
  legendLabel: { fontSize: 11, color: colors.textMuted },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(3),
  },
  navTotal: { fontSize: 13, color: colors.textMuted },
  statusChip: { fontSize: 13, fontWeight: '700' },
  rejectCard: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    padding: spacing(3),
    gap: spacing(1),
  },
  rejectTitle: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  rejectReason: { color: colors.text, fontSize: 14 },
  rejectHint: { color: colors.textMuted, fontSize: 12 },
  dayGroup: { gap: spacing(2) },
  dayHeader: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginTop: spacing(2) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing(3.5),
    gap: spacing(3),
  },
  rowMain: { flex: 1 },
  rowActivity: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowTimes: { fontSize: 13, color: colors.textMuted },
  rowNote: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
  rowDuration: { fontSize: 15, fontWeight: '700', color: colors.primary },
  empty: { color: colors.textMuted },
  hint: { fontSize: 12, color: colors.textMuted },
});
