import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from './ui';
import { usePushNudge } from '../pushNudge';
import { getTheme, spacing } from '../theme';

const t = getTheme();

/**
 * The sign-in nudge. Renders nothing unless this device can still be asked and
 * the person has not already waved it away — see pushNudge.ts.
 *
 * "Not now" is deliberately a low-emphasis link rather than a second button:
 * this sits at the top of Home, and two equal-weight buttons both out-shouted
 * the screen's own actions and doubled the height the card steals from them.
 */
export function PushNudge({ uid }: { uid: string }) {
  const { visible, busy, enable, dismiss } = usePushNudge(uid);
  if (!visible) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.text}>Notifications are not enabled on this device.</Text>
      <Button label="Enable notifications" disabled={busy} onPress={enable} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Not now"
        onPress={dismiss}
        style={styles.dismiss}
      >
        <Text style={styles.dismissText}>Not now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing(2),
    borderWidth: 1,
    borderColor: t.border.subtle,
    borderRadius: 12,
    padding: spacing(3.5),
    marginBottom: spacing(2),
  },
  text: { fontSize: 14, color: t.text.primary },
  /** A real 44pt box, not hitSlop — neighbouring slops overlap. */
  dismiss: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dismissText: { fontSize: 14, color: t.text.muted },
});
