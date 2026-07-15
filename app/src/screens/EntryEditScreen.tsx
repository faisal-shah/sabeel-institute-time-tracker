import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  dayKeyFor,
  entryTimesValid,
  epochFor,
  timeOfDayFor,
  tzLabelFor,
} from '@sabeel/shared';
import { useActivities } from '../activities';
import { useEntry, updateEntry, deleteEntry } from '../entries';
import { ActivityPicker } from '../components/ActivityPicker';
import { Button, ErrorText, Screen } from '../components/ui';
import { colors, spacing } from '../theme';

export function EntryEditScreen({ entryId, editorUid }: { entryId: string; editorUid: string }) {
  const nav = useNavigation();
  const entry = useEntry(entryId);
  const activities = useActivities({ includeArchived: false });

  const [activityId, setActivityId] = useState<string | null>(null);
  const [dateKey, setDateKey] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the form once from the live entry (times shown in the entry's own tz).
  useEffect(() => {
    if (entry && entry.end !== null && !loaded) {
      setActivityId(entry.activityId);
      setDateKey(entry.dayKey);
      setFrom(timeOfDayFor(entry.start, entry.timeZone));
      setTo(timeOfDayFor(entry.end, entry.timeZone));
      setNote(entry.note ?? '');
      setLoaded(true);
    }
  }, [entry, loaded]);

  if (!entry) return <Screen>{null}</Screen>;

  const validFormats =
    /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && /^\d{1,2}:\d{2}$/.test(from) && /^\d{1,2}:\d{2}$/.test(to);
  const start = validFormats ? epochFor(dateKey, from, entry.timeZone) : null;
  const end = validFormats ? epochFor(dateKey, to, entry.timeZone) : null;
  const activity = activities.find((a) => a.id === activityId) ?? null;
  const valid = start !== null && end !== null && entryTimesValid({ start, end });

  const save = async () => {
    if (!valid || start === null || end === null) return;
    setError(null);
    try {
      await updateEntry(entry, {
        activity: activity && activity.id !== entry.activityId ? activity : undefined,
        start,
        end,
        note,
        editorUid,
      });
      nav.goBack();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async () => {
    setError(null);
    try {
      await deleteEntry(entry.id);
      nav.goBack();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <Text style={styles.meta}>
        {entry.source === 'clock' ? 'Clocked session' : 'Manual entry'} · times in{' '}
        {tzLabelFor(entry.start, entry.timeZone)}
        {entry.uid !== editorUid ? ' · editing as manager' : ''}
      </Text>

      <Text style={styles.label}>Activity</Text>
      <ActivityPicker activities={activities} selectedId={activityId} onSelect={setActivityId} />

      <Text style={styles.label}>Date</Text>
      <TextInput value={dateKey} onChangeText={setDateKey} style={styles.input} />

      <View style={styles.timesRow}>
        <View style={styles.grow}>
          <Text style={styles.label}>From</Text>
          <TextInput value={from} onChangeText={setFrom} style={styles.input} />
        </View>
        <View style={styles.grow}>
          <Text style={styles.label}>To</Text>
          <TextInput value={to} onChangeText={setTo} style={styles.input} />
        </View>
      </View>

      <Text style={styles.label}>Note</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        style={[styles.input, styles.noteInput]}
        multiline
      />

      <Button label="Save changes" onPress={save} disabled={!valid} />
      <Button label="Delete entry" kind="danger" onPress={remove} />
      <ErrorText error={error} />
      {dateKey && start !== null && dayKeyFor(start, entry.timeZone) !== entry.dayKey ? (
        <Text style={styles.hint}>This moves the entry to {dayKeyFor(start, entry.timeZone)}.</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 13, color: colors.textMuted },
  label: { fontSize: 13, color: colors.textMuted, marginTop: spacing(2) },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing(3),
    fontSize: 15,
  },
  noteInput: { minHeight: 72, textAlignVertical: 'top' },
  timesRow: { flexDirection: 'row', gap: spacing(3) },
  grow: { flex: 1 },
  hint: { fontSize: 12, color: colors.textMuted },
});
