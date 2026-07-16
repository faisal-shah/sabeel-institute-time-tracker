// Brand tokens — one place for colors/spacing so screens stay consistent.
// Palette: Sabeel Institute "Brand & Website Color Usage Guide" (2026-07-16),
// hexes sampled from the guide's swatches/surfaces:
//   Warm Ivory (~35%, foundation)  ·  Soft Sage (~30%, calm/community)
//   Dark Raspberry (~20%, brand)   ·  Antique Gold (~10%, elegance)
//   Mushroom Taupe (~5%, support text/borders)
export const colors = {
  /** Dark Raspberry — brand identity: buttons, headings, links, CTAs. */
  primary: '#82163A',
  primaryDark: '#5C0F29',
  /** Antique Gold — icons, dividers, small accents ("let gold shine sparingly"). */
  accent: '#D09749',
  /** Gold as TEXT on light backgrounds needs this deeper cut for contrast. */
  accentDeep: '#96661F',
  /** Warm Ivory — main backgrounds, cards, forms. */
  bg: '#FDF8EF',
  /** Soft Sage tint — alternate surfaces, secondary buttons. */
  bgMuted: '#E0E2D4',
  /** Soft Sage full — borders/edges of sage elements, decorative details. */
  sage: '#ACB59D',
  text: '#2B2320',
  /** Mushroom Taupe — secondary text, captions. */
  textMuted: '#7C6A5A',
  danger: '#B3261E',
  /** Taupe-warmed hairlines and card borders. */
  border: '#DFD5C4',
  /** Warm ivory for text/icons on raspberry or sage surfaces (never pure white). */
  onPrimary: '#FBF3E4',
} as const;

export const spacing = (n: number) => n * 4;
