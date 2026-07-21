// Native side of the date/time input seam (web sibling: DateTimeField.web.tsx).
// Keeps the screens' existing string-based state: value is a dayKey
// ('YYYY-MM-DD') for kind='date' or 'HH:MM' for kind='time'.
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { parseDayKey } from '@sabeel/shared';
import { getTheme, spacing } from '../theme';

const t = getTheme();

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toDate(kind: 'date' | 'time', value: string): Date {
  if (kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const { y, m, d } = parseDayKey(value);
    return new Date(y, m - 1, d, 12, 0); // noon avoids DST-edge day drift
  }
  if (kind === 'time' && /^\d{1,2}:\d{2}$/.test(value)) {
    const [h, min] = value.split(':').map(Number);
    return new Date(2000, 0, 1, h, min);
  }
  return new Date();
}

export function DateTimeField({
  kind,
  value,
  onChange,
}: {
  kind: 'date' | 'time';
  value: string;
  onChange: (value: string) => void;
}) {
  const [show, setShow] = useState(false);

  const onPicked = (event: DateTimePickerEvent, picked?: Date) => {
    setShow(false);
    if (event.type !== 'set' || !picked) return;
    onChange(
      kind === 'date'
        ? `${picked.getFullYear()}-${pad(picked.getMonth() + 1)}-${pad(picked.getDate())}`
        : `${pad(picked.getHours())}:${pad(picked.getMinutes())}`,
    );
  };

  return (
    <>
      <Pressable onPress={() => setShow(true)} style={styles.field}>
        <Text style={styles.value}>{value || (kind === 'date' ? 'Pick a date' : 'Pick a time')}</Text>
      </Pressable>
      {show ? (
        <DateTimePicker value={toDate(kind, value)} mode={kind} onChange={onPicked} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    borderWidth: 1,
    borderColor: t.border.subtle,
    borderRadius: 8,
    padding: spacing(3),
  },
  value: { fontSize: 15, color: t.text.primary },
});
