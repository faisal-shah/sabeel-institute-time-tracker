import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useSession } from './src/session';
import { SignInScreen } from './src/screens/SignInScreen';
import { PendingScreen, DisabledScreen } from './src/screens/GateScreens';
import { HomeScreen } from './src/screens/HomeScreen';
import { UsersScreen } from './src/screens/UsersScreen';
import { ActivitiesScreen } from './src/screens/ActivitiesScreen';
import { ManualEntryScreen } from './src/screens/ManualEntryScreen';
import { TimesheetScreen } from './src/screens/TimesheetScreen';
import { EntryEditScreen } from './src/screens/EntryEditScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';
import { PersonDetailScreen } from './src/screens/PersonDetailScreen';
import { ApprovalsScreen } from './src/screens/ApprovalsScreen';
import { TimesheetReviewScreen } from './src/screens/TimesheetReviewScreen';
import type { RootStackParamList } from './src/nav';
import { colors } from './src/theme';
import { initSentry } from './src/sentry';

initSentry();

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const session = useSession();

  let content;
  if (session.phase === 'loading') {
    content = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  } else if (session.phase === 'signedOut') {
    content = <SignInScreen />;
  } else if (!session.profile || session.claims.status !== 'active') {
    // Signed in but not (yet) an active member — gate on the doc/claims state.
    const email = session.user.email ?? '';
    content =
      session.profile?.status === 'disabled' ? (
        <DisabledScreen email={email} />
      ) : (
        <PendingScreen email={email} />
      );
  } else {
    const { profile, claims, user } = session;
    const isApprover = claims.role === 'manager' || claims.admin === true;
    content = (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home">
            {() => <HomeScreen uid={user.uid} profile={profile} claims={claims} />}
          </Stack.Screen>
          <Stack.Screen
            name="ManualEntry"
            options={{
              headerShown: true,
              title: 'Add hours',
              headerStyle: { backgroundColor: colors.primary },
              headerTintColor: '#fff',
            }}
          >
            {({ route }) => {
              const p = (route.params ?? {}) as { forUid?: string; forName?: string };
              return <ManualEntryScreen uid={user.uid} forUid={p.forUid} forName={p.forName} />;
            }}
          </Stack.Screen>
          <Stack.Screen
            name="Timesheet"
            options={{
              headerShown: true,
              title: 'My timesheet',
              headerStyle: { backgroundColor: colors.primary },
              headerTintColor: '#fff',
            }}
          >
            {() => <TimesheetScreen uid={user.uid} profile={profile} claims={claims} />}
          </Stack.Screen>
          <Stack.Screen
            name="EntryEdit"
            options={{
              headerShown: true,
              title: 'Edit entry',
              headerStyle: { backgroundColor: colors.primary },
              headerTintColor: '#fff',
            }}
          >
            {({ route }) => (
              <EntryEditScreen
                entryId={(route.params as { entryId: string }).entryId}
                editorUid={user.uid}
              />
            )}
          </Stack.Screen>
          {claims.role === 'manager' ? (
            <Stack.Screen
              name="Reports"
              options={{
                headerShown: true,
                title: 'Reports',
                headerStyle: { backgroundColor: colors.primary },
                headerTintColor: '#fff',
              }}
            >
              {() => <ReportsScreen />}
            </Stack.Screen>
          ) : null}
          {claims.role === 'manager' ? (
            <Stack.Screen
              name="PersonDetail"
              options={{
                headerShown: true,
                title: 'Lifetime hours',
                headerStyle: { backgroundColor: colors.primary },
                headerTintColor: '#fff',
              }}
            >
              {({ route }) => {
                const p = route.params as { uid: string; displayName: string };
                return <PersonDetailScreen uid={p.uid} displayName={p.displayName} />;
              }}
            </Stack.Screen>
          ) : null}
          {claims.role === 'manager' ? (
            <Stack.Screen
              name="Activities"
              options={{
                headerShown: true,
                title: 'Projects & events',
                headerStyle: { backgroundColor: colors.primary },
                headerTintColor: '#fff',
              }}
            >
              {() => <ActivitiesScreen selfUid={user.uid} />}
            </Stack.Screen>
          ) : null}
          {isApprover ? (
            <Stack.Screen
              name="Approvals"
              options={{
                headerShown: true,
                title: 'Approvals',
                headerStyle: { backgroundColor: colors.primary },
                headerTintColor: '#fff',
              }}
            >
              {() => <ApprovalsScreen uid={user.uid} claims={claims} />}
            </Stack.Screen>
          ) : null}
          {isApprover ? (
            <Stack.Screen
              name="TimesheetReview"
              options={{
                headerShown: true,
                title: 'Review timesheet',
                headerStyle: { backgroundColor: colors.primary },
                headerTintColor: '#fff',
              }}
            >
              {({ route }) => {
                const p = route.params as {
                  uid: string;
                  displayName: string;
                  periodKey: string;
                };
                return (
                  <TimesheetReviewScreen
                    reviewerUid={user.uid}
                    uid={p.uid}
                    displayName={p.displayName}
                    periodKey={p.periodKey}
                  />
                );
              }}
            </Stack.Screen>
          ) : null}
          {isApprover ? (
            <Stack.Screen
              name="Users"
              options={{
                headerShown: true,
                title: 'Users',
                headerStyle: { backgroundColor: colors.primary },
                headerTintColor: '#fff',
              }}
            >
              {() => <UsersScreen selfUid={user.uid} claims={claims} />}
            </Stack.Screen>
          ) : null}
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <>
      {content}
      <StatusBar style="light" />
    </>
  );
}
