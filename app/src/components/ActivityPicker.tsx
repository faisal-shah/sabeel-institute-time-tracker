import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Activity } from '../activities';
import { colors, spacing } from '../theme';

export function ActivityPicker({
  activities,
  selectedId,
  onSelect,
}: {
  activities: Activity[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (activities.length === 0) {
    return (
      <Text style={styles.empty}>
        No projects or events yet — a manager needs to create one first.
      </Text>
    );
  }
  return (
    <View style={styles.wrap}>
      {activities.map((a) => {
        const on = a.id === selectedId;
        return (
          <Pressable
            key={a.id}
            onPress={() => onSelect(a.id)}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{a.name}</Text>
            <Text style={[styles.type, on && styles.typeOn]}>{a.type}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(2),
    alignItems: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { color: colors.text, fontSize: 15, fontWeight: '600' },
  labelOn: { color: '#fff' },
  type: { color: colors.textMuted, fontSize: 11 },
  typeOn: { color: colors.accent },
  empty: { color: colors.textMuted, fontSize: 14 },
});
