import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { signInWithGoogle, REAL_GOOGLE_AVAILABLE } from '../auth/google';
import { devSignInAsGoogle } from '../auth/devSignIn';
import { USE_EMULATORS } from '../env';
import { Button, ErrorText } from '../components/ui';
import { colors, spacing } from '../theme';

export function SignInScreen() {
  const [error, setError] = useState<string | null>(null);
  const [devEmail, setDevEmail] = useState('volunteer@example.com');

  const google = async () => {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const dev = async () => {
    setError(null);
    try {
      const name = devEmail
        .split('@')[0]
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      await devSignInAsGoogle(devEmail.trim(), name);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sabeel Time Tracker</Text>
      <Text style={styles.tagline}>Track your hours. All of it counts.</Text>
      <View style={styles.card}>
        {(REAL_GOOGLE_AVAILABLE || !USE_EMULATORS) && (
          <Button label="Sign in with Google" onPress={google} />
        )}
        {USE_EMULATORS && (
          <>
            <Text style={styles.devLabel}>Dev (emulator) sign-in</Text>
            <TextInput
              value={devEmail}
              onChangeText={setDevEmail}
              autoCapitalize="none"
              inputMode="email"
              style={styles.input}
              placeholder="email"
            />
            <Button label="Dev: sign in" kind="secondary" onPress={dev} />
          </>
        )}
        <ErrorText error={error} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(6),
    gap: spacing(2),
  },
  title: { color: colors.onPrimary, fontSize: 30, fontWeight: '700' },
  tagline: { color: colors.accent, fontSize: 15, marginBottom: spacing(6) },
  card: {
    backgroundColor: colors.onPrimary,
    borderRadius: 14,
    padding: spacing(5),
    gap: spacing(3),
    width: '100%',
    maxWidth: 380,
  },
  devLabel: { color: colors.textMuted, fontSize: 12, marginTop: spacing(2) },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing(3),
    fontSize: 15,
  },
});
