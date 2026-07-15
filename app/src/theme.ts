// Brand tokens — one place for colors/spacing so screens stay consistent.
export const colors = {
  primary: '#1B5E43',
  primaryDark: '#0F3D2A',
  accent: '#C9A227',
  bg: '#FFFFFF',
  bgMuted: '#F4F6F5',
  text: '#1A1D1B',
  textMuted: '#5B6660',
  danger: '#B3261E',
  border: '#DDE3E0',
} as const;

export const spacing = (n: number) => n * 4;
