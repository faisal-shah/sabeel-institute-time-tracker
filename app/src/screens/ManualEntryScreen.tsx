import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { addDays, dayKeyFor, deviceTimeZone, entryTimesValid, parseDayKey } from '@sabeel/shared';
import { useActivities } from '../activities';
import { createManualEntry } from '../entries';
import { ActivityPicker } from '../components/ActivityPicker';
import { Button, ErrorText, Screen } from '../components/ui';
import { colors, spacing } from '../theme';

// Device-local wall time → epoch ms. Manual entries are always in the device's
// timezone — the same timezone stored on the entry.
function toEpoch(dateKey: string, hhmm: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const { y, m, d } = parseDayKey(dateKey);
  const [h, min] = hhmm.split(':').map(Number);
  if (h > 23 || min > 59) return null;
  const ms = new Date(y, m - 1, d, h, min).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function ManualEntryScreen({ uid }: { uid: string }) {
  const nav = useNavigation();
  const activities = useActivities({ includeArchived: false });
  const tz = deviceTimeZone();
  const todayKey = dayKeyFor(Date.now(), tz);

  const [activityId, setActivityId] = useState<string | null>(null);
  const [dateKey, setDateKey] = useState(todayKey);
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('17:00');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const activity = activities.find((a) => a.id === activityId) ?? null;
  const start = toEpoch(dateKey, from);
  const end = toEpoch(dateKey, to);
  const valid =
    activity && start !== null && end !== null && entryTimesValid({ start, end });

  const save = async () => {
    if (!valid || !activity || start === null || end === null) return;
    setError(null);
    try {
      await createManualEntry({ uid, activity, start, end, note });
      nav.goBack();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <Text style={styles.label}>Activity</Text>
      <ActivityPicker activities={activities} selectedId={activityId} onSelect={setActivityId} />

      <Text style={styles.label}>Date</Text>
      <View style={styles.dateRow}>
        <TextInput value={dateKey} onChangeText={setDateKey} style={[styles.input, styles.grow]} />
        <Button label="Today" kind="secondary" onPress={() => setDateKey(todayKey)} />
        <Button
          label="Yesterday"
          kind="secondary"
          onPress={() => setDateKey(addDays(todayKey, -1))}
        />
      </View>

      <View style={styles.timesRow}>
        <View style={styles.grow}>
          <Text style={styles.label}>From</Text>
          <TextInput value={from} onChangeText={setFrom} style={styles.input} placeholder="09:00" />
        </View>
        <View style={styles.grow}>
          <Text style={styles.label}>To</Text>
          <TextInput value={to} onChangeText={setTo} style={styles.input} placeholder="17:00" />
        </View>
      </View>

      <Text style={styles.label}>What did you work on? (optional)</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        style={[styles.input, styles.noteInput]}
        multiline
        placeholder="Notes…"
      />

      <Button label="Save hours" onPress={save} disabled={!valid} />
      {!valid && activity ? (
        <Text style={styles.hint}>
          Times must be HH:MM on the same day, end after start, at most 24h.
        </Text>
      ) : null}
      <ErrorText error={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, color: colors.textMuted, marginTop: spacing(2) },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing(3),
    fontSize: 15,
  },
  noteInput: { minHeight: 72, textAlignVertical: 'top' },
  dateRow: { flexDirection: 'row', gap: spacing(2), alignItems: 'center' },
  timesRow: { flexDirection: 'row', gap: spacing(3) },
  grow: { flex: 1 },
  hint: { fontSize: 12, color: colors.textMuted },
});
