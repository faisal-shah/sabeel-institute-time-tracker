import { useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { signInWithGoogle, REAL_GOOGLE_AVAILABLE } from '../auth/google';
import { devSignInAsGoogle } from '../auth/devSignIn';
import { USE_EMULATORS } from '../env';
import { Button, ErrorText } from '../components/ui';
import { captureError } from '../sentry';
import { colors, spacing } from '../theme';

// Static asset import (Metro resolves images; lint forbids inline require()).
// Reverse variant (ivory+gold) — the only form of the mark allowed on the
// raspberry field; the black+gold original lives on ivory surfaces.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const logoReverse = require('../../assets/logo-reverse.png');

export function SignInScreen() {
  const [error, setError] = useState<string | null>(null);
  const [devEmail, setDevEmail] = useState('volunteer@example.com');

  const google = async () => {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      // User-initiated aborts are not incidents; everything else should be
      // visible in Sentry, not just on this one person's screen.
      if (!/popup-closed-by-user|cancelled-popup-request|user-cancelled/.test(code)) {
        captureError(e, { source: 'signInWithGoogle' });
      }
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
      <Image
        source={logoReverse}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="Sabeel Institute"
      />
      <View style={styles.card}>
        <Text style={styles.title}>Time Tracker</Text>
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
  title: {
    color: colors.primary,
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing(2),
  },
  card: {
    backgroundColor: colors.onPrimary,
    borderRadius: 14,
    padding: spacing(5),
    gap: spacing(3),
    width: '100%',
    maxWidth: 380,
  },
  logo: { width: '82%', height: 150, marginBottom: spacing(2) },
  devLabel: { color: colors.textMuted, fontSize: 12, marginTop: spacing(2) },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing(3),
    fontSize: 15,
  },
});
