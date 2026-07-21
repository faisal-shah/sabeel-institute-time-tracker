import { StyleSheet, Text, View } from 'react-native';
import { signOut } from '../session';
import { Button } from '../components/ui';
import { getTheme, spacing } from '../theme';

const t = getTheme();

function Gate({ title, message, email }: { title: string; message: string; email: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <Text style={styles.email}>{email}</Text>
      <View style={styles.actions}>
        <Button label="Sign out" kind="secondary" onPress={() => signOut()} />
      </View>
    </View>
  );
}

export function PendingScreen({ email }: { email: string }) {
  return (
    <Gate
      title="Almost there"
      message={
        'Your account is waiting for an administrator to approve it.\n' +
        'This screen updates by itself the moment you are approved.'
      }
      email={email}
    />
  );
}

export function DisabledScreen({ email }: { email: string }) {
  return (
    <Gate
      title="Account disabled"
      message="This account has been disabled. Contact your administrator if you think that's a mistake."
      email={email}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.bg.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(8),
    gap: spacing(3),
  },
  title: { fontSize: 24, fontWeight: '700', color: t.text.primary },
  message: { fontSize: 15, color: t.text.secondary, textAlign: 'center', lineHeight: 22 },
  email: { fontSize: 14, color: t.accent.base, fontWeight: '600' },
  actions: { marginTop: spacing(4), width: '100%', maxWidth: 240 },
});
