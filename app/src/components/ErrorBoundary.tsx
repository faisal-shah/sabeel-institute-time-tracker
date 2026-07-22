import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { captureError } from '../sentry';
import { getTheme, spacing } from '../theme';

const t = getTheme();

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/**
 * Top-level crash guard. A thrown error during render otherwise tears down the
 * whole React Native tree with no recovery — the user is stuck on a blank
 * screen until they force-quit. This catches it, reports to Sentry, and shows a
 * recoverable fallback so a single bad render doesn't brick the app.
 *
 * Wraps the entire app tree (see App.tsx), so it also covers provider/status-bar
 * setup, not just screens. "Try again" resets the boundary to re-render the
 * children — enough to recover from a transient render error (e.g. a momentary
 * bad data shape) without a manual restart.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    captureError(error, { source: 'ErrorBoundary' });
  }

  private reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The app hit an unexpected error. Try again, or fully close and reopen the app.
        </Text>
        <Pressable style={styles.button} onPress={this.reset}>
          <Text style={styles.buttonLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.bg.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(6),
    gap: spacing(3),
  },
  title: { fontSize: 20, fontWeight: '700', color: t.text.primary, textAlign: 'center' },
  body: { fontSize: 15, color: t.text.secondary, textAlign: 'center', lineHeight: 22 },
  button: {
    backgroundColor: t.accent.base,
    borderRadius: 10,
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(6),
    minHeight: 48,
    justifyContent: 'center',
    marginTop: spacing(2),
  },
  buttonLabel: { color: t.text.inverse, fontSize: 16, fontWeight: '600' },
});
