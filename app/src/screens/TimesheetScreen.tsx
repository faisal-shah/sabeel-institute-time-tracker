import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  addDays,
  dayKeyFor,
  deviceTimeZone,
  formatDuration,
  timeOfDayFor,
  tzLabelFor,
  weekRange,
} from '@sabeel/shared';
import type { RootStackParamList } from '../nav';
import { useEntriesRange, type TimeEntry } from '../entries';
import { Button, Screen } from '../components/ui';
import { colors, spacing } from '../theme';

function EntryRow({ entry, onPress }: { entry: TimeEntry; onPress: () => void }) {
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

export function TimesheetScreen({ uid }: { uid: string }) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tz = deviceTimeZone();
  const todayKey = dayKeyFor(Date.now(), tz);
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [anchor, setAnchor] = useState(todayKey);

  const range = mode === 'day' ? { fromKey: anchor, toKey: anchor } : weekRange(anchor);
  const entries = useEntriesRange(uid, range.fromKey, range.toKey);

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

  const step = (dir: 1 | -1) => setAnchor(addDays(anchor, dir * (mode === 'day' ? 1 : 7)));
  const label =
    mode === 'day' ? anchor : `${range.fromKey} → ${range.toKey}`;

  return (
    <Screen>
      <View style={styles.toggleRow}>
        {(['day', 'week'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[styles.toggle, mode === m && styles.toggleOn]}
          >
            <Text style={[styles.toggleLabel, mode === m && styles.toggleLabelOn]}>{m}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.navRow}>
        <Button label="‹" kind="secondary" onPress={() => step(-1)} />
        <View style={styles.navCenter}>
          <Text style={styles.navLabel}>{label}</Text>
          <Text style={styles.navTotal}>{formatDuration(total)}</Text>
        </View>
        <Button label="›" kind="secondary" onPress={() => step(1)} />
      </View>
      {anchor !== todayKey ? (
        <Button label="Jump to today" kind="secondary" onPress={() => setAnchor(todayKey)} />
      ) : null}

      {byDay.map(([dayKey, dayEntries]) => (
        <View key={dayKey} style={styles.dayGroup}>
          {mode === 'week' ? (
            <Text style={styles.dayHeader}>
              {dayKey} · {formatDuration(dayEntries.reduce((s, e) => s + (e.durationMinutes ?? 0), 0))}
            </Text>
          ) : null}
          {dayEntries.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              onPress={() => (e.end !== null ? nav.navigate('EntryEdit', { entryId: e.id }) : null)}
            />
          ))}
        </View>
      ))}
      {entries.length === 0 && <Text style={styles.empty}>No hours in this {mode}.</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', gap: spacing(2) },
  toggle: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(1.5),
  },
  toggleOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleLabel: { color: colors.textMuted, fontSize: 14 },
  toggleLabelOn: { color: '#fff' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  navCenter: { flex: 1, alignItems: 'center' },
  navLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  navTotal: { fontSize: 13, color: colors.textMuted },
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
});
