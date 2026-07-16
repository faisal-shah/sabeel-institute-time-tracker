import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { dayKeyFor, deviceTimeZone, formatDuration, periodKeyFor } from '@sabeel/shared';
import type { RootStackParamList } from '../nav';
import { fetchTotals, type Totals } from '../reporting';
import { printStatement, CAN_PRINT } from '../printStatement';
import { Button, ErrorText, Screen } from '../components/ui';
import { colors, spacing } from '../theme';

const LIFETIME = { fromKey: '2000-01-01', toKey: '2999-12-31' };

export function PersonDetailScreen({ uid, displayName }: { uid: string; displayName: string }) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchTotals({ ...LIFETIME, uid })
      .then((t) => live && setTotals(t))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [uid]);

  const print = () => {
    if (!totals) return;
    setStatus(
      printStatement({
        displayName,
        totalLabel: formatDuration(totals.totalMinutes),
        generatedOn: new Date().toLocaleDateString(),
        rows: totals.byActivity.map((a) => ({
          activityName: a.activityName,
          hours: (a.minutes / 60).toFixed(2),
        })),
      }),
    );
  };

  return (
    <Screen>
      <Text style={styles.name}>{displayName}</Text>
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>LIFETIME APPROVED HOURS</Text>
        <Text style={styles.totalValue}>
          {totals ? formatDuration(totals.totalMinutes) : '…'}
        </Text>
      </View>

      {totals?.byActivity.map((a) => (
        <View key={a.activityId} style={styles.row}>
          <Text style={styles.rowLabel}>{a.activityName}</Text>
          <Text style={styles.rowValue}>{formatDuration(a.minutes)}</Text>
        </View>
      ))}
      {totals && totals.byActivity.length === 0 ? (
        <Text style={styles.empty}>No recorded hours yet.</Text>
      ) : null}

      <Button
        label="View timesheets"
        onPress={() =>
          nav.navigate('TimesheetReview', {
            uid,
            displayName,
            periodKey: periodKeyFor(dayKeyFor(Date.now(), deviceTimeZone())),
          })
        }
      />
      <Button
        label={CAN_PRINT ? 'Print statement' : 'Printing is on the website'}
        kind="secondary"
        onPress={print}
        disabled={!totals}
      />
      {status ? <Text style={styles.status}>{status}</Text> : null}
      <ErrorText error={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 22, fontWeight: '700', color: colors.text },
  totalCard: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: spacing(5),
    alignItems: 'center',
  },
  totalLabel: { color: colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  totalValue: { color: '#fff', fontSize: 32, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing(2),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: 15, color: colors.text },
  rowValue: { fontSize: 15, fontWeight: '600', color: colors.primary },
  empty: { color: colors.textMuted },
  status: { color: colors.primary, fontSize: 13 },
});
