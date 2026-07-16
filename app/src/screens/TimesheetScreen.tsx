import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  addDays,
  dayKeyFor,
  deviceTimeZone,
  formatDuration,
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
import { useEntriesRange, type TimeEntry } from '../entries';
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
  submitted: { label: 'Submitted', color: colors.accent },
  approved: { label: 'Approved', color: colors.primary },
  rejected: { label: 'Rejected', color: colors.danger },
} as const;

export function TimesheetScreen({
  uid,
  profile,
  claims,
}: {
  uid: string;
  profile: UserDoc;
  claims: TokenClaims;
}) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tz = deviceTimeZone();
  const todayKey = dayKeyFor(Date.now(), tz);
  const [anchor, setAnchor] = useState(todayKey);
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

  const stepPeriod = (dir: 1 | -1) =>
    setAnchor(dir === -1 ? addDays(period.fromKey, -1) : addDays(period.toKey, 1));

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
      <View style={styles.monthStrip}>
        {month.map((p) => {
          const st = p.fromKey === period.fromKey && sheet !== undefined
            ? (sheet?.status ?? 'draft')
            : (sheetByPeriod.get(p.fromKey)?.status ?? 'draft');
          const on = p.fromKey === period.fromKey;
          return (
            <Pressable
              key={p.fromKey}
              onPress={() => setAnchor(p.fromKey)}
              style={[styles.monthChip, on && styles.monthChipOn]}
            >
              <View style={[styles.dot, { backgroundColor: STATUS_CHIP[st].color }]} />
              <Text style={[styles.monthChipLabel, on && styles.monthChipLabelOn]}>
                {periodLabel(p)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.navRow}>
        <Button label="‹" kind="secondary" onPress={() => stepPeriod(-1)} />
        <View style={styles.navCenter}>
          <Text style={styles.navLabel}>{periodLabel(period)}</Text>
          <Text style={styles.navTotal}>{formatDuration(total)}</Text>
          {status && status !== 'draft' ? (
            <Text style={[styles.statusChip, { color: STATUS_CHIP[status].color }]}>
              {STATUS_CHIP[status].label}
            </Text>
          ) : null}
        </View>
        <Button label="›" kind="secondary" onPress={() => stepPeriod(1)} />
      </View>
      {periodRangeFor(todayKey).fromKey !== period.fromKey ? (
        <Button label="Jump to this week" kind="secondary" onPress={() => setAnchor(todayKey)} />
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

      {status === 'draft' ? (
        <>
          {!approverUid ? (
            <Text style={styles.hint}>Pick your timesheet approver on the home screen first.</Text>
          ) : null}
          {hasRunningInPeriod ? (
            <Text style={styles.hint}>Clock out before submitting this week.</Text>
          ) : null}
          {!started ? <Text style={styles.hint}>This week hasn't started yet.</Text> : null}
          <Button
            label={total === 0 ? 'Submit timesheet (no hours)' : 'Submit timesheet'}
            onPress={() => act(() => submitTimesheet(uid, period, approverUid!, entries))}
            disabled={!approverUid || hasRunningInPeriod || !started}
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
  monthStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
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
  monthChipLabel: { fontSize: 12, color: colors.textMuted },
  monthChipLabelOn: { color: '#fff' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  navCenter: { flex: 1, alignItems: 'center' },
  navLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
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
