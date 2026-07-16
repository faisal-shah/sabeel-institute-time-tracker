import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { formatDuration, periodLabel, type TokenClaims } from '@sabeel/shared';
import type { RootStackParamList } from '../nav';
import { useApprovalQueue } from '../timesheets';
import { useUsers } from '../users';
import { Screen } from '../components/ui';
import { colors, spacing } from '../theme';

/** The approver's queue: timesheets submitted to me (admins may view all). */
export function ApprovalsScreen({ uid, claims }: { uid: string; claims: TokenClaims }) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [showAll, setShowAll] = useState(false);
  const queue = useApprovalQueue(uid, { all: claims.admin === true && showAll });
  const users = useUsers();
  const nameOf = useMemo(
    () => new Map(users.map((u) => [u.uid, u.displayName])),
    [users],
  );

  return (
    <Screen>
      {claims.admin ? (
        <View style={styles.toggleRow}>
          {[false, true].map((all) => (
            <Pressable
              key={String(all)}
              onPress={() => setShowAll(all)}
              style={[styles.toggle, showAll === all && styles.toggleOn]}
            >
              <Text style={[styles.toggleLabel, showAll === all && styles.toggleLabelOn]}>
                {all ? 'All submitted' : 'Assigned to me'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {queue.map((ts) => (
        <Pressable
          key={ts.id}
          style={styles.row}
          onPress={() =>
            nav.navigate('TimesheetReview', {
              uid: ts.uid,
              displayName: nameOf.get(ts.uid) ?? ts.uid,
              periodKey: ts.periodKey,
            })
          }
        >
          <View style={styles.rowMain}>
            <Text style={styles.rowName}>{nameOf.get(ts.uid) ?? ts.uid}</Text>
            <Text style={styles.rowPeriod}>
              {periodLabel({ fromKey: ts.periodKey, toKey: ts.toKey })} · submitted{' '}
              {new Date(ts.submittedAt).toLocaleDateString()}
            </Text>
          </View>
          <Text style={styles.rowTotal}>{formatDuration(ts.totalMinutes)}</Text>
        </Pressable>
      ))}
      {queue.length === 0 ? (
        <Text style={styles.empty}>Nothing waiting for approval. ✅</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', gap: spacing(2) },
  toggle: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(1.5),
  },
  toggleOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleLabel: { color: colors.textMuted, fontSize: 13 },
  toggleLabelOn: { color: colors.onPrimary },
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
  rowName: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowPeriod: { fontSize: 13, color: colors.textMuted },
  rowTotal: { fontSize: 15, fontWeight: '700', color: colors.primary },
  empty: { color: colors.textMuted, fontSize: 14 },
});
