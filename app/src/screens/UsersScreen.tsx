import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { type TokenClaims, type UserRole, type UserStatus } from '@sabeel/shared';
import { functions } from '../firebase';
import { approverChoices, setApprover, useUsers } from '../users';
import { SearchablePicker } from '../components/SearchablePicker';
import { Button, ErrorText, Screen } from '../components/ui';
import { colors, spacing } from '../theme';

const setUserAccess = httpsCallable<
  { uid: string; status?: UserStatus; role?: UserRole; admin?: boolean },
  { status: UserStatus; role: UserRole; admin: boolean }
>(functions, 'setUserAccess');

const statusRank: Record<UserStatus, number> = { pending: 0, active: 1, disabled: 2 };

/**
 * Admins: approve/disable, roles, admin grants, approver assignment.
 * Managers (non-admin): read-only list + approver assignment for non-admins.
 */
export function UsersScreen({ selfUid, claims }: { selfUid: string; claims: TokenClaims }) {
  const rows = useUsers();
  const [error, setError] = useState<string | null>(null);
  const isAdmin = claims.admin === true;

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          statusRank[a.status] - statusRank[b.status] ||
          a.displayName.localeCompare(b.displayName),
      ),
    [rows],
  );
  const approvers = useMemo(() => approverChoices(rows), [rows]);

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

          {u.status === 'active' && (isAdmin || !u.admin) ? (
            <View style={styles.approverRow}>
              <Text style={styles.approverLabel}>Approver</Text>
              <SearchablePicker
                items={approvers
                  .filter((a) => a.uid !== u.uid || u.admin) // only admins may self-approve
                  .map((a) => ({
                    id: a.uid,
                    label: a.uid === u.uid ? `${a.displayName} (self)` : a.displayName,
                    sublabel: a.admin ? 'admin' : 'manager',
                  }))}
                selectedId={u.approverUid}
                onSelect={(id) => {
                  setError(null);
                  setApprover(u.uid, id).catch((e) => setError((e as Error).message));
                }}
                placeholder="No approver assigned"
                title={`Approver for ${u.displayName}`}
              />
            </View>
          ) : null}

          {isAdmin ? (
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
              {u.status === 'active' && !u.admin && (
                <Button
                  label="Make admin"
                  kind="secondary"
                  onPress={() => change({ uid: u.uid, admin: true })}
                />
              )}
              {u.status === 'active' && u.admin && u.uid !== selfUid && (
                <Button
                  label="Remove admin"
                  kind="secondary"
                  onPress={() => change({ uid: u.uid, admin: false })}
                />
              )}
            </View>
          ) : null}
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
  approverRow: { gap: spacing(1), marginTop: spacing(1) },
  approverLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginTop: spacing(2) },
  empty: { color: colors.textMuted },
});
