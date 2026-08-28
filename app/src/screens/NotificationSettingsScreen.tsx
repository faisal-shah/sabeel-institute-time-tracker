import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { COLLECTIONS, type NotifPrefs, type TokenClaims, type UserDoc } from '@sabeel/shared';
import { db } from '../firebase';
import { Button, Screen } from '../components/ui';
import { enablePush, pushPromptState } from '../notify';
import { getTheme, spacing } from '../theme';

const t = getTheme();

type PrefKey = keyof NotifPrefs;

const ROWS: { key: PrefKey; label: string; hint?: string; who?: 'approver' | 'admin' }[] = [
  { key: 'rejected', label: 'My timesheet is rejected' },
  { key: 'approved', label: 'My timesheet is approved' },
  { key: 'submitted', label: 'A timesheet is submitted to me', who: 'approver' },
  { key: 'newUser', label: 'New account requests', who: 'admin' },
  {
    key: 'reminder',
    label: 'Weekly submit reminder',
    hint: 'Starts Tuesday when last week has unsubmitted hours, then repeats daily until you submit. Turn this off if you don’t submit every week.',
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
  // What this device can be offered. Resolved on mount — never in the press
  // handler below, which may not await before asking.
  const [push, setPush] = useState<
    'checking' | 'granted' | 'denied' | 'default' | 'unsupported'
  >('checking');

  useEffect(() => {
    let live = true;
    void pushPromptState().then((state) => {
      if (live) setPush(state);
    });
    return () => {
      live = false;
    };
  }, []);

  // enablePush must be the FIRST thing this handler does — a browser only
  // honours a permission request raised directly from a press, and an await
  // before it loses that. Button calls onPress synchronously and awaits the
  // promise it returns, which keeps the chain intact. See notify.web.ts.
  const turnOnPush = () =>
    enablePush(uid).then(async (result) => {
      if (result === 'granted') return setPush('granted');
      if (result === 'unavailable') return setPush('unsupported');
      // Re-read rather than assuming 'denied': a browser makes a refusal stick,
      // but a dismissed Android dialog leaves this askable, and the button
      // should come back rather than send someone to a settings screen that
      // shows nothing wrong.
      setPush(await pushPromptState());
    });

  const setPref = (key: PrefKey, on: boolean) =>
    updateDoc(doc(db, COLLECTIONS.users, uid), { notifPrefs: { ...prefs, [key]: on } });

  const rows = ROWS.filter(
    (r) =>
      r.who === undefined ||
      (r.who === 'approver' && isApprover) ||
      (r.who === 'admin' && claims.admin === true),
  );

  return (
    <Screen width="read">
      <Text style={styles.intro}>
        Notifications arrive on every device where you’ve allowed them. A switch here turns
        that kind of notification off everywhere.
      </Text>
      {push === 'default' ? (
        <View style={styles.device}>
          <Text style={styles.deviceText}>
            This device isn’t set up to receive notifications yet.
          </Text>
          <Button label="Turn on notifications" onPress={turnOnPush} />
        </View>
      ) : null}
      {push === 'denied' ? (
        <Text style={styles.intro}>
          Notifications are turned off for this app. Turn them back on where this device
          keeps its permissions — your browser’s site settings, or the system settings for
          the app — then reopen this screen.
        </Text>
      ) : null}
      {push === 'unsupported' ? (
        <Text style={styles.intro}>
          This device can’t show notifications. Your choices below are saved either way, and
          apply on any device where you are signed in.
        </Text>
      ) : null}
      {rows.map((r) => (
        <View key={r.key} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>{r.label}</Text>
            {r.hint ? <Text style={styles.hint}>{r.hint}</Text> : null}
          </View>
          <Switch
            value={prefs[r.key] !== false}
            onValueChange={(on) => void setPref(r.key, on)}
            trackColor={{ true: t.accent.base, false: t.border.subtle }}
            thumbColor={t.text.inverse}
          />
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, color: t.text.secondary, marginBottom: spacing(2) },
  device: {
    gap: spacing(2),
    borderWidth: 1,
    borderColor: t.border.subtle,
    borderRadius: 12,
    padding: spacing(3.5),
    marginBottom: spacing(2),
  },
  deviceText: { fontSize: 14, color: t.text.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(3),
    borderWidth: 1,
    borderColor: t.border.subtle,
    borderRadius: 12,
    padding: spacing(3.5),
  },
  rowText: { flex: 1 },
  label: { fontSize: 15, fontWeight: '600', color: t.text.primary },
  hint: { fontSize: 12, color: t.text.muted, marginTop: 2 },
});
