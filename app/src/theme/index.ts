/**
 * Semantic theme tokens. Every color in the app comes from here.
 *
 * SINGLE LIGHT THEME — no dark mode (decided 2026-07-21; see docs/BRAND.md).
 * `getTheme()` returns the one static theme. Every consumer reads it at module
 * scope, which is all a light-only app needs.
 *
 * Usage:
 *   const t = getTheme();
 *   const styles = StyleSheet.create({ card: { backgroundColor: t.bg.surface } });
 * Safe precisely because the theme is static (single light theme) — the value is
 * fixed at module load. If a second theme or runtime override is ever added,
 * this file is where it layers in (re-adding a reactive `useTheme()` hook then).
 *
 * Names describe ROLE, not appearance — `text.muted`, never `text.grey`.
 *
 * This app carries a few tokens the kanban reference lacks (accent.gold /
 * goldText / sage decorative accents, bg.goldSoft, bg.sage, accent.onAccentMuted)
 * because it uses gold and sage decoratively more than kanban does. See
 * docs/BRAND.md.
 */
import { palette } from './palette';

function build() {
  const p = palette;
  return {
    bg: {
      /** App background, behind everything. */
      canvas: p.canvas,
      /** Cards, sheets, list rows. */
      surface: p.surface,
      /** Surfaces that sit above other surfaces (menus). */
      raised: p.raised,
      /** Recessed areas — text inputs. */
      inset: p.inset,
      /** Tint behind selected/active items. */
      accentSoft: p.accentSoft,
      /** Tint behind destructive confirmation. */
      dangerSoft: p.dangerSoft,
      /** Ivory-gold tint behind a pending / awaiting row. */
      goldSoft: p.goldSoft,
      /** Sage-charactered fill for secondary buttons and neutral chips. */
      sage: p.bgSage,
    },
    text: {
      primary: p.textPrimary,
      secondary: p.textSecondary,
      /** Captions, placeholders — never body text. */
      muted: p.textMuted,
      /** Text on an accent (raspberry) fill. */
      inverse: p.textInverse,
      accent: p.accent,
      danger: p.danger,
    },
    border: {
      subtle: p.borderSubtle,
      strong: p.borderStrong,
    },
    accent: {
      base: p.accent,
      hover: p.accentHover,
      onAccent: p.accentText,
      /** Muted text on a raspberry fill (e.g. the running-timer "since" line). */
      onAccentMuted: p.onAccentMuted,
      /** Decorative gold — dividers, hairline borders, fills. NOT read-critical. */
      gold: p.gold,
      /** Gold used AS TEXT (labels, status). Deepened to read on ivory. */
      goldText: p.goldText,
      /** Decorative sage — status dots, accent borders. */
      sage: p.sage,
    },
    feedback: {
      danger: p.danger,
      success: p.success,
      warning: p.warning,
    },
    effect: {
      /** Scrim behind a modal. */
      overlay: p.overlay,
      shadow: p.shadow,
    },
  } as const;
}

export type Theme = ReturnType<typeof build>;

const theme: Theme = build();

/**
 * The single app theme. Every consumer reads it at module scope
 * (`const t = getTheme()`), which is all this light-only app needs. If a second
 * theme or a runtime override is ever added, this is the one place it layers in;
 * a reactive `useTheme()` hook would be re-added here at that point.
 */
export function getTheme(): Theme {
  return theme;
}

/** Spacing scale, in points — 4pt grid. Kept from the tracker's original theme. */
export const spacing = (n: number) => n * 4;
