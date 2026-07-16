import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ActivityType } from '@sabeel/shared';
import { useActivities, createActivity, setActivityStatus } from '../activities';
import { Button, ErrorText, Screen } from '../components/ui';
import { colors, spacing } from '../theme';

export function ActivitiesScreen({ selfUid }: { selfUid: string }) {
  const rows = useActivities({ includeArchived: true });
  const [name, setName] = useState('');
  const [type, setType] = useState<ActivityType>('project');
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await createActivity({ name, type, createdBy: selfUid });
      setName('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const flip = async (id: string, status: 'active' | 'archived') => {
    setError(null);
    try {
      await setActivityStatus(id, status);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <View style={styles.form}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="New project or event name"
          style={styles.input}
        />
        <View style={styles.typeRow}>
          {(['project', 'event'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setType(t)}
              style={[styles.typeChip, type === t && styles.typeChipOn]}
            >
              <Text style={[styles.typeLabel, type === t && styles.typeLabelOn]}>{t}</Text>
            </Pressable>
          ))}
        </View>
        <Button label="Add" onPress={add} disabled={!name.trim()} />
        <ErrorText error={error} />
      </View>

      {rows.map((a) => (
        <View key={a.id} style={[styles.card, a.status === 'archived' && styles.cardArchived]}>
          <View style={styles.cardText}>
            <Text style={styles.name}>{a.name}</Text>
            <Text style={styles.meta}>
              {a.type}
              {a.status === 'archived' ? ' · archived' : ''}
            </Text>
          </View>
          {a.status === 'active' ? (
            <Button label="Archive" kind="secondary" onPress={() => flip(a.id, 'archived')} />
          ) : (
            <Button label="Restore" kind="secondary" onPress={() => flip(a.id, 'active')} />
          )}
        </View>
      ))}
      {rows.length === 0 && <Text style={styles.empty}>Nothing yet — add the first one.</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing(2), marginBottom: spacing(2) },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing(3),
    fontSize: 15,
  },
  typeRow: { flexDirection: 'row', gap: spacing(2) },
  typeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(1.5),
  },
  typeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeLabel: { color: colors.textMuted, fontSize: 14 },
  typeLabelOn: { color: colors.onPrimary },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing(3.5),
    gap: spacing(3),
  },
  cardArchived: { opacity: 0.55 },
  cardText: { flexShrink: 1 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
  empty: { color: colors.textMuted },
});
