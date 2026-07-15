import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  dayKeyFor,
  deviceTimeZone,
  formatDuration,
  minutesBetween,
  timeOfDayFor,
  type TokenClaims,
  type UserDoc,
} from '@sabeel/shared';
import type { RootStackParamList } from '../nav';
import { signOut } from '../session';
import { useActivities } from '../activities';
import { clockIn, clockOut, useEntry, useDayMinutes } from '../entries';
import { ActivityPicker } from '../components/ActivityPicker';
import { Button, ErrorText, Screen } from '../components/ui';
import { colors, spacing } from '../theme';

export function HomeScreen({
  uid,
  profile,
  claims,
}: {
  uid: string;
  profile: UserDoc;
  claims: TokenClaims;
}) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const activities = useActivities({ includeArchived: false });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useEntry(profile.activeEntryId);

  // Tick once a minute while clocked in so the elapsed figure stays honest.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, [running]);

  const tz = deviceTimeZone();
  const todayKey = dayKeyFor(Date.now(), tz);
  const todayMinutes = useDayMinutes(uid, todayKey);

  const selected = activities.find((a) => a.id === selectedId) ?? null;

  const onClockIn = async () => {
    if (!selected) return;
    setError(null);
    try {
      await clockIn(uid, selected);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const onClockOut = async () => {
    if (!running) return;
    setError(null);
    try {
      await clockOut(uid, running);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen title="Sabeel Time Tracker">
      <Text style={styles.greeting}>Salaam, {profile.displayName}</Text>
      <Text style={styles.today}>Today: {formatDuration(todayMinutes)}</Text>

      {running ? (
        <View style={styles.runningCard}>
          <Text style={styles.runningLabel}>CLOCKED IN</Text>
          <Text style={styles.runningActivity}>{running.activityName}</Text>
          <Text style={styles.runningSince}>
            since {timeOfDayFor(running.start, running.timeZone)} ·{' '}
            {formatDuration(Math.max(0, minutesBetween(running.start, Date.now())))} elapsed
          </Text>
          {minutesBetween(running.start, Date.now()) >= 8 * 60 ? (
            <Text style={styles.longWarning}>
              You've been clocked in a long time — remember to clock out. Sessions over
              12h are closed automatically.
            </Text>
          ) : null}
          <Button label="Clock out" kind="danger" onPress={onClockOut} />
        </View>
      ) : (
        <View style={styles.clockCard}>
          <Text style={styles.pickLabel}>What are you working on?</Text>
          <ActivityPicker
            activities={activities}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <Button label="Clock in" onPress={onClockIn} disabled={!selected} />
        </View>
      )}
      <ErrorText error={error} />

      <Button
        label="Add hours manually"
        kind="secondary"
        onPress={() => nav.navigate('ManualEntry')}
      />
      <Button label="My timesheet" kind="secondary" onPress={() => nav.navigate('Timesheet')} />

      <View style={styles.footer}>
        {claims.role === 'manager' ? (
          <>
            <Button label="Reports" onPress={() => nav.navigate('Reports')} />
            <Button
              label="Projects & events"
              kind="secondary"
              onPress={() => nav.navigate('Activities')}
            />
          </>
        ) : null}
        {claims.admin ? (
          <Button label="Manage users" onPress={() => nav.navigate('Users')} />
        ) : null}
        <Button label="Sign out" kind="secondary" onPress={() => signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: 20, fontWeight: '600', color: colors.text },
  today: { fontSize: 14, color: colors.textMuted },
  clockCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing(4),
    gap: spacing(3),
  },
  pickLabel: { fontSize: 14, color: colors.textMuted },
  runningCard: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: spacing(5),
    gap: spacing(2),
  },
  runningLabel: { color: colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  runningActivity: { color: '#fff', fontSize: 22, fontWeight: '700' },
  runningSince: { color: '#D5E3DC', fontSize: 14, marginBottom: spacing(2) },
  longWarning: {
    color: colors.accent,
    fontSize: 13,
    marginBottom: spacing(2),
    lineHeight: 18,
  },
  footer: { gap: spacing(3), marginTop: spacing(4) },
});
