import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  addDays,
  formatDuration,
  overlappingEntryIds,
  periodLabel,
  periodRangeFor,
} from '@sabeel/shared';
import type { RootStackParamList } from '../nav';
import { useEntriesRange, type TimeEntry } from '../entries';
import { approveTimesheet, rejectTimesheet, useTimesheet } from '../timesheets';
import { EntryRow } from './TimesheetScreen';
import { Button, ErrorText, Screen } from '../components/ui';
import { getTheme, spacing } from '../theme';

const t = getTheme();

const STATUS_LINE = {
  draft: { label: 'Not submitted', color: t.text.secondary },
  submitted: { label: 'Submitted — awaiting your decision', color: t.accent.goldText },
  approved: { label: 'Approved', color: t.accent.base },
  rejected: { label: 'Rejected — back with the owner', color: t.feedback.danger },
} as const;

/**
 * A manager's view of one person's weeks: per-day breakdown with week
 * navigation, entry corrections (tap → edit) and add-on-behalf in any
 * non-approved week, and approve/reject when the week is submitted.
 */
export function TimesheetReviewScreen({
  reviewerUid,
  uid,
  displayName,
  periodKey,
}: {
  reviewerUid: string;
  uid: string;
  displayName: string;
  /** Initial week; the screen navigates freely from here. */
  periodKey: string;
}) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [anchor, setAnchor] = useState(periodKey);
  const period = periodRangeFor(anchor);
  const sheet = useTimesheet(uid, period.fromKey);
  const status = sheet === undefined ? undefined : (sheet?.status ?? 'draft');
  const entries = useEntriesRange(uid, period.fromKey, period.toKey);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const stepPeriod = (dir: 1 | -1) =>
    setAnchor(dir === -1 ? addDays(period.fromKey, -1) : addDays(period.toKey, 1));

  const conflicts = useMemo(() => overlappingEntryIds(entries), [entries]);
  const total = useMemo(
    () => entries.reduce((s, e) => s + (e.durationMinutes ?? 0), 0),
    [entries],
  );

  // Sun–Sat day scaffold so empty days are visible during review.
  const days = useMemo(() => {
    const list: { dayKey: string; dayEntries: TimeEntry[] }[] = [];
    for (let d = period.fromKey; d <= period.toKey; d = addDays(d, 1)) {
      list.push({ dayKey: d, dayEntries: entries.filter((e) => e.dayKey === d) });
    }
    return list;
  }, [period.fromKey, period.toKey, entries]);

  const act = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
      nav.goBack();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <Text style={styles.title}>{displayName}</Text>
      <View style={styles.navRow}>
        <Button label="‹" kind="secondary" onPress={() => stepPeriod(-1)} />
        <View style={styles.navCenter}>
          <Text style={styles.navLabel}>{periodLabel(period)}</Text>
          <Text style={styles.total}>Total: {formatDuration(total)}</Text>
          {status ? (
            <Text style={[styles.statusLine, { color: STATUS_LINE[status].color }]}>
              {STATUS_LINE[status].label}
            </Text>
          ) : null}
        </View>
        <Button label="›" kind="secondary" onPress={() => stepPeriod(1)} />
      </View>
      {sheet?.status === 'rejected' && sheet.rejectReason ? (
        <Text style={styles.gone}>Reason: {sheet.rejectReason}</Text>
      ) : null}

      {days.map(({ dayKey, dayEntries }) => (
        <View key={dayKey} style={styles.dayGroup}>
          <Text style={styles.dayHeader}>
            {dayKey} ·{' '}
            {formatDuration(dayEntries.reduce((s, e) => s + (e.durationMinutes ?? 0), 0))}
          </Text>
          {dayEntries.length === 0 ? (
            <Text style={styles.noHours}>No hours.</Text>
          ) : (
            dayEntries.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                conflict={conflicts.has(e.id)}
                onPress={() =>
                  e.end !== null ? nav.navigate('EntryEdit', { entryId: e.id }) : null
                }
              />
            ))
          )}
        </View>
      ))}

      {status === 'approved' ? (
        <Text style={styles.gone}>
          Approved — this week is locked. Only an admin can reopen it.
        </Text>
      ) : (
        <Button
          label={`Add entry for ${displayName}`}
          kind="secondary"
          onPress={() => nav.navigate('ManualEntry', { forUid: uid, forName: displayName })}
        />
      )}

      {sheet && sheet.status === 'submitted' ? (
        <>
          <Button
            label="Approve timesheet"
            onPress={() => act(() => approveTimesheet(sheet, reviewerUid, entries))}
          />
          <Text style={styles.rejectLabel}>Or reject with a reason:</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="What needs fixing?"
            style={styles.reasonInput}
            multiline
          />
          <Button
            label="Reject timesheet"
            kind="danger"
            disabled={reason.trim().length === 0}
            onPress={() => act(() => rejectTimesheet(sheet, reviewerUid, reason.trim()))}
          />
        </>
      ) : null}
      <ErrorText error={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', color: t.text.primary },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  navCenter: { flex: 1, alignItems: 'center' },
  navLabel: { fontSize: 15, fontWeight: '600', color: t.text.primary },
  statusLine: { fontSize: 13, fontWeight: '700' },
  total: { fontSize: 14, color: t.text.secondary },
  gone: { color: t.feedback.danger, fontSize: 14 },
  dayGroup: { gap: spacing(2) },
  dayHeader: { fontSize: 13, fontWeight: '700', color: t.text.secondary, marginTop: spacing(2) },
  noHours: { fontSize: 13, color: t.text.secondary, fontStyle: 'italic' },
  rejectLabel: { fontSize: 13, color: t.text.secondary, marginTop: spacing(2) },
  reasonInput: {
    borderWidth: 1,
    borderColor: t.border.subtle,
    borderRadius: 8,
    padding: spacing(3),
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: 'top',
  },
});
