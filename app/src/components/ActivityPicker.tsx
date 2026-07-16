import { StyleSheet, Text } from 'react-native';
import type { Activity } from '../activities';
import { SearchablePicker } from './SearchablePicker';
import { colors } from '../theme';

/** Activity selection — searchable list so 30 activities stay usable on a phone. */
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
    <SearchablePicker
      items={activities.map((a) => ({ id: a.id, label: a.name, sublabel: a.type }))}
      selectedId={selectedId}
      onSelect={onSelect}
      placeholder="Pick a project or event"
      title="Projects & events"
    />
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.textMuted, fontSize: 14 },
});
