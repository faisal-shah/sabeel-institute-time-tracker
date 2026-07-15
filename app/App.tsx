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
import type { RootStackParamList } from './src/nav';
import { colors } from './src/theme';

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
    content = (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home">
            {() => <HomeScreen profile={profile} claims={claims} />}
          </Stack.Screen>
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
          {claims.admin ? (
            <Stack.Screen
              name="Users"
              options={{
                headerShown: true,
                title: 'Users',
                headerStyle: { backgroundColor: colors.primary },
                headerTintColor: '#fff',
              }}
            >
              {() => <UsersScreen selfUid={user.uid} />}
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
