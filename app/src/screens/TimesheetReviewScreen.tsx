import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { addDays, formatDuration, periodLabel, periodRangeFor } from '@sabeel/shared';
import type { RootStackParamList } from '../nav';
import { useEntriesRange, type TimeEntry } from '../entries';
import { approveTimesheet, rejectTimesheet, useTimesheet } from '../timesheets';
import { EntryRow } from './TimesheetScreen';
import { Button, ErrorText, Screen } from '../components/ui';
import { colors, spacing } from '../theme';

/**
 * Approver's view of one person's submitted period: per-day breakdown, entry
 * corrections (tap → edit), add-on-behalf, then approve or reject with reason.
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
  periodKey: string;
}) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const period = periodRangeFor(periodKey);
  const sheet = useTimesheet(uid, periodKey);
  const entries = useEntriesRange(uid, period.fromKey, period.toKey);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

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
      <Text style={styles.title}>
        {displayName} · {periodLabel(period)}
      </Text>
      <Text style={styles.total}>Total: {formatDuration(total)}</Text>

      {sheet === null ? (
        <Text style={styles.gone}>
          This timesheet is no longer submitted — it was withdrawn or already handled.
        </Text>
      ) : null}
      {sheet && sheet.status !== 'submitted' ? (
        <Text style={styles.gone}>This timesheet is now “{sheet.status}”.</Text>
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
                onPress={() =>
                  e.end !== null ? nav.navigate('EntryEdit', { entryId: e.id }) : null
                }
              />
            ))
          )}
        </View>
      ))}

      <Button
        label={`Add entry for ${displayName}`}
        kind="secondary"
        onPress={() => nav.navigate('ManualEntry', { forUid: uid, forName: displayName })}
      />

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
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  total: { fontSize: 14, color: colors.textMuted },
  gone: { color: colors.danger, fontSize: 14 },
  dayGroup: { gap: spacing(2) },
  dayHeader: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginTop: spacing(2) },
  noHours: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
  rejectLabel: { fontSize: 13, color: colors.textMuted, marginTop: spacing(2) },
  reasonInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing(3),
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: 'top',
  },
});
