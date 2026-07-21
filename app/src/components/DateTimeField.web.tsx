// Web side of the date/time input seam (native sibling: DateTimeField.tsx).
// Uses the browser's native <input type="date|time"> pickers; value stays the
// screens' string format (dayKey / 'HH:MM'), which matches the input's own.
import { getTheme } from '../theme';

const t = getTheme();

const inputStyle: React.CSSProperties = {
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: t.border.subtle,
  borderRadius: 8,
  padding: 12,
  fontSize: 15,
  color: t.text.primary,
  fontFamily: 'inherit',
  backgroundColor: t.bg.canvas,
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
