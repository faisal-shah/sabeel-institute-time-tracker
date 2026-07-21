import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { type TokenClaims, type UserRole, type UserStatus } from '@sabeel/shared';
import { functions } from '../firebase';
import { confirmAction } from '../confirm';
import { approverChoices, setApprover, useUsers } from '../users';
import { SearchablePicker } from '../components/SearchablePicker';
import { Button, ErrorText, Screen } from '../components/ui';
import { getTheme, spacing } from '../theme';

const t = getTheme();

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

          {isAdmin && u.status === 'pending' ? (
            <View style={styles.actions}>
              <Button label="Approve" onPress={() => change({ uid: u.uid, status: 'active' })} />
            </View>
          ) : null}

          {isAdmin && u.status !== 'pending' ? (
            <>
              {/* State editors, not verb buttons: each row SHOWS the current
                  value; changing it asks for confirmation, so a mistap is a
                  visible flip you decline instead of an action you discover. */}
              <StateRow label="Role">
                <Segmented
                  options={['member', 'manager'] as const}
                  value={u.role}
                  disabled={u.status !== 'active' || (u.uid === selfUid && u.role === 'manager')}
                  onChange={async (role) => {
                    if (
                      await confirmAction(
                        `Change role to ${role}?`,
                        `${u.displayName} will ${role === 'manager' ? 'gain' : 'lose'} manager tools (activities, reports, approvals).`,
                      )
                    )
                      change({ uid: u.uid, role: role as UserRole });
                  }}
                />
              </StateRow>
              <StateRow label="Admin">
                <Switch
                  value={u.admin}
                  disabled={u.status !== 'active' || u.uid === selfUid}
                  trackColor={{ true: t.accent.base, false: t.border.subtle }}
                  thumbColor={t.text.inverse}
                  onValueChange={async (next) => {
                    if (
                      await confirmAction(
                        next ? 'Grant admin access?' : 'Remove admin?',
                        next
                          ? `This is full control. ${u.displayName} will be able to approve, disable, and delete ANY user (including you), grant admin to others, change roles, and reopen approved timesheets. Only grant this to people you fully trust.`
                          : `${u.displayName} will no longer manage users or timesheets.`,
                      )
                    )
                      change({ uid: u.uid, admin: next });
                  }}
                />
              </StateRow>
              <StateRow label={u.status === 'active' ? 'Active' : 'Disabled'}>
                <Switch
                  value={u.status === 'active'}
                  disabled={u.uid === selfUid}
                  trackColor={{ true: t.accent.base, false: t.border.subtle }}
                  thumbColor={t.text.inverse}
                  onValueChange={async (active) => {
                    if (
                      await confirmAction(
                        active ? 'Re-activate account?' : 'Disable account?',
                        active
                          ? `${u.displayName} will regain access to the app.`
                          : `${u.displayName} will be signed out and unable to log hours.`,
                      )
                    )
                      change({ uid: u.uid, status: active ? 'active' : 'disabled' });
                  }}
                />
              </StateRow>
            </>
          ) : null}
        </View>
      ))}
      {sorted.length === 0 && <Text style={styles.empty}>No users yet.</Text>}
    </Screen>
  );
}

function StateRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.stateRow}>
      <Text style={styles.stateLabel}>{label}</Text>
      {children}
    </View>
  );
}

/** Two-value segmented control that shows the current state. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
  danger,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
  /** Option rendered in danger color when selected (e.g. 'disabled'). */
  danger?: T;
}) {
  return (
    <View style={[styles.seg, disabled && styles.segDisabled]}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable
            key={o}
            disabled={disabled || on}
            onPress={() => onChange(o)}
            style={[styles.segOpt, on && (o === danger ? styles.segOnDanger : styles.segOn)]}
          >
            <Text style={[styles.segLabel, on && styles.segLabelOn]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: t.border.subtle,
    borderRadius: 12,
    padding: spacing(4),
    gap: spacing(1.5),
  },
  cardPending: { borderColor: t.accent.gold, backgroundColor: t.bg.goldSoft },
  name: { fontSize: 16, fontWeight: '600', color: t.text.primary },
  email: { fontSize: 14, color: t.text.secondary },
  badges: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(1) },
  badge: {
    backgroundColor: t.bg.sage,
    color: t.text.secondary,
    borderRadius: 6,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(0.5),
    fontSize: 12,
    overflow: 'hidden',
  },
  badgeAdmin: { backgroundColor: t.accent.gold, color: t.text.primary },
  approverRow: { gap: spacing(1), marginTop: spacing(1) },
  approverLabel: { fontSize: 12, fontWeight: '700', color: t.text.secondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginTop: spacing(2) },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing(2),
    gap: spacing(3),
  },
  stateLabel: { fontSize: 13, fontWeight: '700', color: t.text.secondary },
  seg: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: t.accent.sage,
    borderRadius: 8,
    overflow: 'hidden',
  },
  segDisabled: { opacity: 0.5 },
  segOpt: { paddingHorizontal: spacing(3.5), paddingVertical: spacing(1.5) },
  segOn: { backgroundColor: t.accent.base },
  segOnDanger: { backgroundColor: t.feedback.danger },
  segLabel: { fontSize: 13, color: t.text.secondary },
  segLabelOn: { color: t.text.inverse, fontWeight: '700' },
  empty: { color: t.text.secondary },
});
