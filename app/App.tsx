import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { formatDuration } from '@sabeel/shared';
import { colors, spacing } from './src/theme';

// Phase 0 walking skeleton: proves the Expo app builds and renders on Android and
// web, and that @sabeel/shared resolves through Metro. Replaced in Phase 1.
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sabeel Time Tracker</Text>
      <Text style={styles.subtitle}>Phase 0 — walking skeleton</Text>
      <Text style={styles.demo}>shared lib says: {formatDuration(125)}</Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(2),
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.accent,
    fontSize: 16,
  },
  demo: {
    color: '#FFFFFF',
    opacity: 0.8,
    fontSize: 14,
  },
});
