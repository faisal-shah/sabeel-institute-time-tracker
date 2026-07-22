import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { formatDuration, periodLabel } from '@sabeel/shared';
import type { RootStackParamList } from '../nav';
import { useRejectedSheets } from '../timesheets';
import { useApproverChoices } from '../users';
import { CardGrid, Screen } from '../components/ui';
import { getTheme, spacing } from '../theme';

const t = getTheme();

/**
 * The owner's rejection backlog: every rejected week — any month — in one flat
 * list with the reason inline, oldest first. Tapping a row opens the normal
 * week view anchored there (reason card, editable entries, Resubmit), so
 * resolving uses the flow people already know. Old rejections stop hiding
 * behind month-by-month chip scrolling.
 */
export function NeedsAttentionScreen({ uid }: { uid: string }) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const sheets = useRejectedSheets(uid);
  // Rejections come from managers/admins, whose profiles every active user may
  // read — so names resolve without the manager-only users listing.
  const approvers = useApproverChoices();
  const nameOf = useMemo(
    () => new Map(approvers.map((a) => [a.uid, a.displayName])),
    [approvers],
  );

  return (
    <Screen width="list">
      {sheets.length === 0 ? (
        <Text style={styles.empty}>Nothing needs your attention. ✅</Text>
      ) : (
        <Text style={styles.intro}>
          {sheets.length === 1
            ? 'One timesheet was rejected. Tap it to fix and resubmit.'
            : `${sheets.length} timesheets were rejected. Tap one to fix and resubmit.`}
        </Text>
      )}
      <CardGrid>
        {sheets.map((ts) => (
        <Pressable
          key={ts.id}
          style={styles.row}
          onPress={() => nav.navigate('Timesheet', { initialPeriodKey: ts.periodKey })}
        >
          <View style={styles.rowTop}>
            <Text style={styles.rowPeriod}>
              {periodLabel({ fromKey: ts.periodKey, toKey: ts.toKey })}
            </Text>
            <Text style={styles.rowTotal}>{formatDuration(ts.totalMinutes)}</Text>
          </View>
          {ts.rejectReason ? (
            <Text style={styles.rowReason} numberOfLines={3}>
              “{ts.rejectReason}”
            </Text>
          ) : null}
          <Text style={styles.rowMeta}>
            Rejected{ts.decidedBy ? ` by ${nameOf.get(ts.decidedBy) ?? 'a manager'}` : ''}
            {ts.decidedAt ? ` · ${new Date(ts.decidedAt).toLocaleDateString()}` : ''} · tap to
            fix ›
          </Text>
        </Pressable>
        ))}
      </CardGrid>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 14, color: t.text.secondary },
  empty: { fontSize: 15, color: t.text.secondary },
  row: {
    borderWidth: 1,
    borderColor: t.feedback.danger,
    borderRadius: 12,
    padding: spacing(3.5),
    gap: spacing(1.5),
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing(2) },
  rowPeriod: { fontSize: 15, fontWeight: '700', color: t.text.primary },
  rowTotal: { fontSize: 15, fontWeight: '700', color: t.accent.base },
  rowReason: { fontSize: 14, color: t.text.primary },
  rowMeta: { fontSize: 12, color: t.text.secondary },
});
