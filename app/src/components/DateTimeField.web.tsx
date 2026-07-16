// Web side of the date/time input seam (native sibling: DateTimeField.tsx).
// Uses the browser's native <input type="date|time"> pickers; value stays the
// screens' string format (dayKey / 'HH:MM'), which matches the input's own.
import { colors } from '../theme';

const inputStyle: React.CSSProperties = {
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.border,
  borderRadius: 8,
  padding: 12,
  fontSize: 15,
  color: colors.text,
  fontFamily: 'inherit',
  backgroundColor: colors.bg,
  width: '100%',
  boxSizing: 'border-box',
};

export function DateTimeField({
  kind,
  value,
  onChange,
}: {
  kind: 'date' | 'time';
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type={kind}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      style={inputStyle}
    />
  );
}
