# Sabeel Institute brand colors

**Source of truth: the designer's "Option 1" palette (2026-07-21).** This is a
deliberate *revision* of the original colour-usage guide, not a re-measure of it —
the old guide is **superseded**. This file is the machine-readable restatement
plus the app-level decisions the palette itself does not state (accessibility
cuts, the no-dark-mode call, and the accents this app adds).

**Both Sabeel apps share this palette exactly** — this time tracker and the
sibling `sabeel-institute-kanban` (the reference implementation). It is one
identity across two products. The canonical write-up of the palette, its roles
and the accessibility rules is the shared **`sabeel-color-scheme` skill**
(`faisal-shah/agent-skills`); this file records how *this app* applies it.

## The palette

| Color | Hex | Share | Role | Where |
|---|---|---|---|---|
| Warm Ivory | `#F6EBDD` | 35% | Foundation | Main backgrounds, cards, forms |
| Soft Sage | `#A8B89A` | 30% | Calm & community | Alternate surfaces, decor, in-progress dot |
| Dark Raspberry | `#83114F` | 20% | Brand identity | Logo, headings, buttons, links, CTAs |
| Antique Gold | `#C6A15B` | 10% | Elegance | Dividers, borders, accents, hover, badges |
| Mushroom Taupe | `#A58D7A` | 5% | Support | Captions, borders, shadows |

### What changed from the old guide

Two colours moved far enough to reread as different colours; the other three
barely shifted. This app had shipped the *old* values, so adopting Option 1 was a
coordinated change with the kanban app — not a correction of one against the other.

- **Raspberry `#82163A` → `#83114F`** (ΔE ~17): brick red to **plum**. The most
  visible change — it is every primary button, header, chip and control. The
  hue moved to ~327, so anything that hand-derived a tint of the old red had to
  be re-derived from the new hue, not nudged.
- **Gold `#D09749` → `#C6A15B`** (ΔE ~13): a brighter yellow-gold to a muted tan.
- Ivory, sage and taupe shifted only slightly.

## Two deliberate departures, and why

**1. Body text is a darkened taupe, not Mushroom Taupe.**
Mushroom Taupe (`#A58D7A`) on Warm Ivory is ~2.7:1 — below the WCAG AA minimum of
4.5:1 for body text. Legibility wins:

- Primary text `#3A2F28` — deep warm brown, ~11:1.
- Secondary text `#6A5748` — darkened taupe, ~5.8:1. **Most `text.muted` uses in
  the old theme moved to this** during the Option-1 migration.
- Mushroom Taupe (`text.muted`) is kept only for **placeholders, field hints, the
  status legend and the dev label** — where softness is the point and contrast is
  not load-bearing.

Raspberry on ivory is ~8.3:1, so headings and links are fine as specified. Same
rule, quieter: **gold as a functional signal is deepened** — `#C6A15B` is ~2.1:1
on ivory, so gold used as *text* uses `#795E2A` (`accent.goldText`, ~5.2:1) and a
gold *warning* signal uses `#977535`. True gold stays true only as decoration.

One app-specific nuance: on the raspberry running-timer card, gold is left
**true** (`accent.gold`) — the ivory-contrast cut is for gold on *ivory*; on the
dark plum, true gold reads fine and the deepened cut would read *worse*.

**2. There is no dark mode — single light theme (decided 2026-07-21).**
`app.json` pins `userInterfaceStyle: "light"`. `useTheme()` returns one theme. If
the brand ever wants dark, a `dark` variant goes into `app/src/theme/palette.ts`
and `useTheme()` is the one place that would select it; no screen would change,
because screens only read role tokens.

## Tokens this app adds beyond the kanban set

The kanban app barely uses gold or sage decoratively, so its theme surfaces gold
only as `feedback.warning`. This app uses both as accents, so
`app/src/theme/index.ts` adds:

| Token | Hex | Use |
|---|---|---|
| `accent.gold` | `#C6A15B` | Decorative gold — pending-card border, admin-badge fill, gold-on-plum labels |
| `accent.goldText` | `#795E2A` | Gold used AS TEXT — total labels, "Submitted" status, selected picker sub |
| `accent.sage` | `#A8B89A` | Decorative sage — the "in progress" dot, secondary-button border |
| `accent.onAccentMuted` | `#D0A3B3` | Muted text on a raspberry fill (running-timer "since" line) |
| `bg.goldSoft` | `#ECDCC3` | Tint behind a pending/awaiting user card |
| `bg.sage` | `#C3CAB1` | Sage-charactered fill — secondary buttons, neutral status chips |

Timesheet **status colors** are semantic tokens, not new brand colours:
Not submitted → `text.secondary`, Submitted → `accent.goldText`, Approved →
`accent.base` (plum), Rejected → `feedback.danger`. With raspberry now a plum,
the approved (plum) and rejected (red) dots are clearly distinct — they were
closer under the old brick-red.

## The logo

`app/assets/logo.png` — Arabic calligraphy reading *Sabeel* with gold accent
strokes. **One asset, no plate and no tint**: a flat `tintColor` would recolour
the mark and throw the gold away. It appears on the **sign-in screen only**;
inside the app the brand is carried by the palette.

## How this is enforced in code

- `app/src/theme/palette.ts` is the **only** file allowed to contain color
  literals. An ESLint rule (`no-restricted-syntax`) rejects hex/rgb/hsl anywhere
  else under `app/src`.
- **One exemption:** `app/src/printStatement.web.ts` is a print stylesheet —
  paper is always light, so it carries literal Option-1 hexes by design. Keep
  them in sync with this palette by hand when the brand changes.
- Screens consume **semantic tokens** from `app/src/theme/index.ts`
  (`bg.canvas`, `text.primary`, `accent.base`, …), never brand names — so a
  brand refresh is a one-file change. Module-scope `StyleSheet.create` uses
  `getTheme()`; components may use the `useTheme()` hook. Both return the same
  static single-light theme.
