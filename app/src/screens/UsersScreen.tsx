import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { COLLECTIONS, type UserDoc, type UserRole, type UserStatus } from '@sabeel/shared';
import { db, functions } from '../firebase';
import { Button, ErrorText, Screen } from '../components/ui';
import { colors, spacing } from '../theme';

type Row = UserDoc & { uid: string };

const setUserAccess = httpsCallable<
  { uid: string; status?: UserStatus; role?: UserRole; admin?: boolean },
  { status: UserStatus; role: UserRole; admin: boolean }
>(functions, 'setUserAccess');

const statusRank: Record<UserStatus, number> = { pending: 0, active: 1, disabled: 2 };

export function UsersScreen({ selfUid }: { selfUid: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      onSnapshot(
        collection(db, COLLECTIONS.users),
        (snap) => {
          setRows(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as UserDoc) })));
        },
        (e) => setError(e.message),
      ),
    [],
  );

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          statusRank[a.status] - statusRank[b.status] ||
          a.displayName.localeCompare(b.displayName),
      ),
    [rows],
  );

  const change = async (input: Parameters<typeof setUserAccess>[0]) => {
    setError(null);
    try {
      await setUserAccess(input);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <ErrorText error={error} />
      {sorted.map((u) => (
        <View key={u.uid} style={[styles.card, u.status === 'pending' && styles.cardPending]}>
          <Text style={styles.name}>
            {u.displayName}
            {u.uid === selfUid ? '  (you)' : ''}
          </Text>
          <Text style={styles.email}>{u.email}</Text>
          <View style={styles.badges}>
            <Text style={styles.badge}>{u.status}</Text>
            <Text style={styles.badge}>{u.role}</Text>
            {u.admin ? <Text style={[styles.badge, styles.badgeAdmin]}>admin</Text> : null}
          </View>
          <View style={styles.actions}>
            {u.status === 'pending' && (
              <Button label="Approve" onPress={() => change({ uid: u.uid, status: 'active' })} />
            )}
            {u.status === 'active' && u.uid !== selfUid && (
              <Button
                label="Disable"
                kind="danger"
                onPress={() => change({ uid: u.uid, status: 'disabled' })}
              />
            )}
            {u.status === 'disabled' && (
              <Button
                label="Re-activate"
                kind="secondary"
                onPress={() => change({ uid: u.uid, status: 'active' })}
              />
            )}
            {u.status === 'active' && u.role === 'member' && (
              <Button
                label="Make manager"
                kind="secondary"
                onPress={() => change({ uid: u.uid, role: 'manager' })}
              />
            )}
            {u.status === 'active' && u.role === 'manager' && u.uid !== selfUid && (
              <Button
                label="Make member"
                kind="secondary"
                onPress={() => change({ uid: u.uid, role: 'member' })}
              />
            )}
          </View>
        </View>
      ))}
      {sorted.length === 0 && <Text style={styles.empty}>No users yet.</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing(4),
    gap: spacing(1.5),
  },
  cardPending: { borderColor: colors.accent, backgroundColor: '#FFFBEE' },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  email: { fontSize: 14, color: colors.textMuted },
  badges: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(1) },
  badge: {
    backgroundColor: colors.bgMuted,
    color: colors.textMuted,
    borderRadius: 6,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(0.5),
    fontSize: 12,
    overflow: 'hidden',
  },
  badgeAdmin: { backgroundColor: colors.accent, color: '#3A2E00' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginTop: spacing(2) },
  empty: { color: colors.textMuted },
});
