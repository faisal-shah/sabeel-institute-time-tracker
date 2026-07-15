import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { UserDoc, TokenClaims } from '@sabeel/shared';
import type { RootStackParamList } from '../nav';
import { signOut } from '../session';
import { Button, Screen } from '../components/ui';
import { colors, spacing } from '../theme';

export function HomeScreen({
  profile,
  claims,
}: {
  profile: UserDoc;
  claims: TokenClaims;
}) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Screen title="Sabeel Time Tracker">
      <Text style={styles.greeting}>Salaam, {profile.displayName}</Text>
      <View style={styles.badges}>
        <Text style={styles.badge}>{profile.role}</Text>
        {profile.admin ? <Text style={[styles.badge, styles.badgeAdmin]}>admin</Text> : null}
      </View>
      <Text style={styles.placeholder}>
        Clock in/out arrives in Phase 3 — this is the Phase 1 shell.
      </Text>
      {claims.admin ? (
        <Button label="Manage users" onPress={() => nav.navigate('Users')} />
      ) : null}
      <Button label="Sign out" kind="secondary" onPress={() => signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: 20, fontWeight: '600', color: colors.text },
  badges: { flexDirection: 'row', gap: spacing(2) },
  badge: {
    backgroundColor: colors.bgMuted,
    color: colors.textMuted,
    borderRadius: 6,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    fontSize: 12,
    overflow: 'hidden',
  },
  badgeAdmin: { backgroundColor: colors.accent, color: '#3A2E00' },
  placeholder: { color: colors.textMuted, fontSize: 14, marginVertical: spacing(2) },
});
