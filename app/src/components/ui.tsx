import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useListenerError } from '../liveQuery';
import { getTheme, spacing } from '../theme';

const t = getTheme();

export function Screen({ children, title }: { children: ReactNode; title?: string }) {
  // Live-data failures surface on every screen — a silently broken listener
  // must never look like "there's just no data" (see the 2026-07-16 postmortem).
  const listenerError = useListenerError();

  // KeyboardAwareScrollView (react-native-keyboard-controller) tracks the IME
  // via WindowInsets, which is the ONLY thing that works under edge-to-edge
  // (edgeToEdgeEnabled=true) — the legacy Keyboard events don't fire there, so a
  // bottom input like the reject reason stayed hidden behind the keyboard.
  // bottomOffset keeps the focused field clear of the keyboard.
  return (
    <View style={styles.screen}>
      {title ? (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
      ) : null}
      {listenerError ? <Text style={styles.listenerError}>{listenerError}</Text> : null}
      <KeyboardAwareScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        bottomOffset={spacing(6)}
      >
        {children}
      </KeyboardAwareScrollView>
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
        <ActivityIndicator color={kind === 'secondary' ? t.accent.base : t.text.inverse} />
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
  screen: { flex: 1, backgroundColor: t.bg.canvas },
  header: {
    // Ivory chrome: the title sits on the canvas, not on a raspberry bar
    // (brand chrome-vs-content rule).
    backgroundColor: t.bg.canvas,
    paddingTop: spacing(12),
    paddingBottom: spacing(4),
    paddingHorizontal: spacing(5),
  },
  headerTitle: { color: t.text.primary, fontSize: 22, fontWeight: '700' },
  body: { padding: spacing(5), gap: spacing(3) },
  btn: {
    borderRadius: 10,
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(5),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnPrimary: { backgroundColor: t.accent.base },
  btnSecondary: {
    backgroundColor: t.bg.sage,
    borderWidth: 1,
    borderColor: t.accent.sage,
  },
  btnDanger: { backgroundColor: t.feedback.danger },
  btnDim: { opacity: 0.6 },
  btnLabel: { color: t.text.inverse, fontSize: 16, fontWeight: '600' },
  btnLabelSecondary: { color: t.accent.base },
  error: { color: t.feedback.danger, fontSize: 14 },
  listenerError: {
    backgroundColor: t.feedback.danger,
    color: t.text.inverse,
    fontSize: 13,
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(5),
  },
});
