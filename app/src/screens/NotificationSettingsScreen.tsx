import { StyleSheet, Switch, Text, View } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { COLLECTIONS, type NotifPrefs, type TokenClaims, type UserDoc } from '@sabeel/shared';
import { db } from '../firebase';
import { Screen } from '../components/ui';
import { colors, spacing } from '../theme';

type PrefKey = keyof NotifPrefs;

const ROWS: { key: PrefKey; label: string; hint?: string; who?: 'approver' | 'admin' }[] = [
  { key: 'rejected', label: 'My timesheet is rejected' },
  { key: 'approved', label: 'My timesheet is approved' },
  { key: 'submitted', label: 'A timesheet is submitted to me', who: 'approver' },
  { key: 'newUser', label: 'New account requests', who: 'admin' },
  {
    key: 'reminder',
    label: 'Weekly submit reminder',
    hint: 'A Tuesday nudge when last week has hours that were never submitted. Turn this off if you don’t submit every week.',
  },
];

export function NotificationSettingsScreen({
  uid,
  profile,
  claims,
}: {
  uid: string;
  profile: UserDoc;
  claims: TokenClaims;
}) {
  const prefs = profile.notifPrefs ?? {};
  const isApprover = claims.role === 'manager' || claims.admin === true;

  const setPref = (key: PrefKey, on: boolean) =>
    updateDoc(doc(db, COLLECTIONS.users, uid), { notifPrefs: { ...prefs, [key]: on } });

  const rows = ROWS.filter(
    (r) =>
      r.who === undefined ||
      (r.who === 'approver' && isApprover) ||
      (r.who === 'admin' && claims.admin === true),
  );

  return (
    <Screen>
      <Text style={styles.intro}>
        Notifications arrive on every device where you’ve allowed them — the app asks for
        permission when you sign in. A switch here turns that kind of notification off
        everywhere.
      </Text>
      {rows.map((r) => (
        <View key={r.key} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>{r.label}</Text>
            {r.hint ? <Text style={styles.hint}>{r.hint}</Text> : null}
          </View>
          <Switch
            value={prefs[r.key] !== false}
            onValueChange={(on) => void setPref(r.key, on)}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.onPrimary}
          />
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, color: colors.textMuted, marginBottom: spacing(2) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing(3.5),
  },
  rowText: { flex: 1 },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
