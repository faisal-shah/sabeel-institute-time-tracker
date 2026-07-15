import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { addDays, dayKeyFor, deviceTimeZone, formatDuration, monthRange } from '@sabeel/shared';
import type { RootStackParamList } from '../nav';
import { useActivities } from '../activities';
import { useUsers } from '../users';
import { fetchTotals, fetchCsv, syncDriveNow, type Totals } from '../reporting';
import { saveCsv } from '../saveCsv';
import { Button, ErrorText, Screen } from '../components/ui';
import { colors, spacing } from '../theme';

type Window = 'week' | 'month' | 'year' | 'all';

function windowRange(w: Window, todayKey: string): { fromKey: string; toKey: string } {
  if (w === 'all') return { fromKey: '2000-01-01', toKey: '2999-12-31' };
  if (w === 'week') return { fromKey: addDays(todayKey, -6), toKey: todayKey };
  if (w === 'month') return monthRange(todayKey);
  const [y] = todayKey.split('-');
  return { fromKey: `${y}-01-01`, toKey: `${y}-12-31` };
}

export function ReportsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const todayKey = dayKeyFor(Date.now(), deviceTimeZone());
  const activities = useActivities({ includeArchived: true });
  const users = useUsers();

  const [window, setWindow] = useState<Window>('month');
  const [personUid, setPersonUid] = useState<string | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const filter = useMemo(() => {
    const r = windowRange(window, todayKey);
    return {
      ...r,
      ...(personUid ? { uid: personUid } : {}),
      ...(activityId ? { activityId } : {}),
    };
  }, [window, personUid, activityId, todayKey]);

  useEffect(() => {
    let live = true;
    setError(null);
    fetchTotals(filter)
      .then((t) => live && setTotals(t))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [filter]);

  const download = async () => {
    setError(null);
    setStatus(null);
    try {
      const { csv, filename } = await fetchCsv(filter);
      setStatus(await saveCsv(filename, csv));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <Text style={styles.section}>Period</Text>
      <View style={styles.chipRow}>
        {(['week', 'month', 'year', 'all'] as const).map((w) => (
          <Chip key={w} label={w} on={window === w} onPress={() => setWindow(w)} />
        ))}
      </View>

      <Text style={styles.section}>Person</Text>
      <View style={styles.chipRow}>
        <Chip label="Everyone" on={!personUid} onPress={() => setPersonUid(null)} />
        {users
          .filter((u) => u.status === 'active')
          .map((u) => (
            <Chip
              key={u.uid}
              label={u.displayName}
              on={personUid === u.uid}
              onPress={() => setPersonUid(u.uid)}
            />
          ))}
      </View>

      <Text style={styles.section}>Activity</Text>
      <View style={styles.chipRow}>
        <Chip label="All" on={!activityId} onPress={() => setActivityId(null)} />
        {activities.map((a) => (
          <Chip
            key={a.id}
            label={a.name}
            on={activityId === a.id}
            onPress={() => setActivityId(a.id)}
          />
        ))}
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>
          {totals ? formatDuration(totals.totalMinutes) : '…'}
        </Text>
      </View>

      {totals && totals.byActivity.length > 0 ? (
        <View style={styles.breakdown}>
          <Text style={styles.section}>By activity</Text>
          {totals.byActivity.map((a) => (
            <Row key={a.activityId} label={a.activityName} value={formatDuration(a.minutes)} />
          ))}
        </View>
      ) : null}

      {totals && !personUid && totals.byPerson.length > 0 ? (
        <View style={styles.breakdown}>
          <Text style={styles.section}>By person (tap for lifetime statement)</Text>
          {totals.byPerson.map((p) => (
            <Pressable
              key={p.uid}
              onPress={() => nav.navigate('PersonDetail', { uid: p.uid, displayName: p.displayName })}
            >
              <Row label={p.displayName} value={formatDuration(p.minutes)} chevron />
            </Pressable>
          ))}
        </View>
      ) : null}

      <Button label="Export CSV" onPress={download} />
      <Button
        label="Sync to Google Drive now"
        kind="secondary"
        onPress={async () => {
          setError(null);
          setStatus(null);
          try {
            setStatus(await syncDriveNow());
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      {status ? <Text style={styles.status}>{status}</Text> : null}
      <ErrorText error={error} />
    </Screen>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{label}</Text>
    </Pressable>
  );
}

function Row({
  label,
  value,
  chevron,
}: {
  label: string;
  value: string;
  chevron?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>
        {value}
        {chevron ? '  ›' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginTop: spacing(2) },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(1.5),
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel: { color: colors.textMuted, fontSize: 13 },
  chipLabelOn: { color: '#fff' },
  totalCard: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: spacing(5),
    alignItems: 'center',
    marginTop: spacing(3),
  },
  totalLabel: { color: colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  totalValue: { color: '#fff', fontSize: 32, fontWeight: '700' },
  breakdown: { gap: spacing(1) },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing(2),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: 15, color: colors.text },
  rowValue: { fontSize: 15, fontWeight: '600', color: colors.primary },
  status: { color: colors.primary, fontSize: 13 },
});
