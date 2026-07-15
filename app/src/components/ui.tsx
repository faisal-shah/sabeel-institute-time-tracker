import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, spacing } from '../theme';

export function Screen({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <View style={styles.screen}>
      {title ? (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    setBusy(true);
    try {
      await onPress();
    } finally {
      setBusy(false);
    }
  };
  const off = disabled || busy;
  return (
    <Pressable
      onPress={handle}
      disabled={off}
      style={({ pressed }) => [
        styles.btn,
        kind === 'primary' && styles.btnPrimary,
        kind === 'secondary' && styles.btnSecondary,
        kind === 'danger' && styles.btnDanger,
        (pressed || off) && styles.btnDim,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={kind === 'secondary' ? colors.primary : '#fff'} />
      ) : (
        <Text style={[styles.btnLabel, kind === 'secondary' && styles.btnLabelSecondary]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return <Text style={styles.error}>{error}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.primary,
    paddingTop: spacing(12),
    paddingBottom: spacing(4),
    paddingHorizontal: spacing(5),
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  body: { padding: spacing(5), gap: spacing(3) },
  btn: {
    borderRadius: 10,
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(5),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnSecondary: {
    backgroundColor: colors.bgMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnDanger: { backgroundColor: colors.danger },
  btnDim: { opacity: 0.6 },
  btnLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnLabelSecondary: { color: colors.primary },
  error: { color: colors.danger, fontSize: 14 },
});
