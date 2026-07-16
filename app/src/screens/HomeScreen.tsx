import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  dayKeyFor,
  deviceTimeZone,
  formatDuration,
  minutesBetween,
  periodKeyFor,
  periodLabel,
  periodRangeFor,
  timeOfDayFor,
  type TokenClaims,
  type UserDoc,
} from '@sabeel/shared';
import type { RootStackParamList } from '../nav';
import { signOut } from '../session';
import { useActivities } from '../activities';
import { clockIn, clockOut, useEntry, useDayMinutes, explainEntryWriteError } from '../entries';
import { useTimesheet, useRejectedCount, useApprovalQueue } from '../timesheets';
import { setApprover, useApproverChoices } from '../users';
import { ActivityPicker } from '../components/ActivityPicker';
import { SearchablePicker } from '../components/SearchablePicker';
import { Button, ErrorText, Screen } from '../components/ui';
import { colors, spacing } from '../theme';

const STATUS_LABEL = {
  submitted: 'Submitted — awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected — needs your attention',
} as const;

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

  // This week's timesheet state: clock-in is locked once it's submitted/approved.
  const currentPeriod = periodRangeFor(todayKey);
  const currentSheet = useTimesheet(uid, periodKeyFor(todayKey));
  const periodLocked =
    currentSheet != null && (currentSheet.status === 'submitted' || currentSheet.status === 'approved');
  const rejectedCount = useRejectedCount(uid);

  // Approver self-service (sticky; stamped at submission).
  const approvers = useApproverChoices();
  const isApprover = claims.role === 'manager' || claims.admin === true;
  const queue = useApprovalQueue(uid);

  const selected = activities.find((a) => a.id === selectedId) ?? null;

  const onClockIn = async () => {
    if (!selected) return;
    setError(null);
    try {
      await clockIn(uid, selected);
    } catch (e) {
      setError(explainEntryWriteError(e));
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

      {rejectedCount > 0 ? (
        <Pressable style={styles.rejectedBanner} onPress={() => nav.navigate('Timesheet')}>
          <Text style={styles.rejectedText}>
            {rejectedCount === 1
              ? 'A timesheet was rejected — tap to review and resubmit.'
              : `${rejectedCount} timesheets were rejected — tap to review and resubmit.`}
          </Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.periodStrip} onPress={() => nav.navigate('Timesheet')}>
        <Text style={styles.periodLabel}>This week · {periodLabel(currentPeriod)}</Text>
        <Text
          style={[
            styles.periodStatus,
            currentSheet?.status === 'approved' && styles.statusApproved,
            currentSheet?.status === 'rejected' && styles.statusRejected,
          ]}
        >
          {currentSheet == null ? 'Not submitted' : STATUS_LABEL[currentSheet.status]}
        </Text>
      </Pressable>

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
      ) : periodLocked ? (
        <View style={styles.clockCard}>
          <Text style={styles.pickLabel}>
            This week's timesheet is {currentSheet?.status}. Withdraw it from “My timesheet”
            {currentSheet?.status === 'approved' ? ' (needs an admin to reopen)' : ''} to log
            more hours this week.
          </Text>
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

      <View style={styles.approverRow}>
        <Text style={styles.approverLabel}>My timesheet approver</Text>
        <SearchablePicker
          items={approvers
            .filter((a) => a.uid !== uid || claims.admin === true) // only admins may self-approve
            .map((a) => ({
              id: a.uid,
              label: a.uid === uid ? `${a.displayName} (myself)` : a.displayName,
              sublabel: a.admin ? 'admin' : 'manager',
            }))}
          selectedId={profile.approverUid}
          onSelect={(id) => {
            setError(null);
            setApprover(uid, id).catch((e) => setError((e as Error).message));
          }}
          placeholder="Choose who approves your hours"
          title="Timesheet approver"
        />
      </View>

      <View style={styles.footer}>
        {isApprover ? (
          <Button
            label={queue.length > 0 ? `Approvals (${queue.length})` : 'Approvals'}
            onPress={() => nav.navigate('Approvals')}
          />
        ) : null}
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
        {claims.admin || claims.role === 'manager' ? (
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
  rejectedBanner: {
    backgroundColor: colors.danger,
    borderRadius: 10,
    padding: spacing(3),
  },
  rejectedText: { color: colors.onPrimary, fontSize: 14, fontWeight: '600' },
  periodStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing(3),
    gap: spacing(2),
  },
  periodLabel: { fontSize: 13, color: colors.textMuted },
  periodStatus: { fontSize: 13, fontWeight: '700', color: colors.text },
  statusApproved: { color: colors.primary },
  statusRejected: { color: colors.danger },
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
  runningActivity: { color: colors.onPrimary, fontSize: 22, fontWeight: '700' },
  runningSince: { color: '#EBCAD5', fontSize: 14, marginBottom: spacing(2) },
  longWarning: {
    color: colors.accent,
    fontSize: 13,
    marginBottom: spacing(2),
    lineHeight: 18,
  },
  approverRow: { gap: spacing(2), marginTop: spacing(2) },
  approverLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  footer: { gap: spacing(3), marginTop: spacing(4) },
});
