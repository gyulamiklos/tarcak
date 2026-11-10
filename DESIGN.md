---
version: alpha
name: "Tarcak"
description: "Local-first, encrypted personal finance app for one person on their own phone: pockets, multi-currency balances and one ledger."
colors:
  primary: "#c35311"
  on-primary: "#ffffff"
  secondary: "#333333"
  tertiary: "#fff3e8"
  neutral: "#f8f9fa"
  on-neutral: "#111111"
  error: "#b00020"
  success: "#2e7d32"
  neutral-dark: "#0a0a0a"
  on-neutral-dark: "#f0f0f0"
  primary-dark: "#e8702e"
  on-primary-dark: "#0a0a0a"
  error-dark: "#ff8a80"
typography:
  display:
    fontFamily: "JetBrains Mono"
    fontSize: "28px"
    fontWeight: 700
  headline:
    fontFamily: "JetBrains Mono"
    fontSize: "20px"
    fontWeight: 600
  body:
    fontFamily: "JetBrains Mono"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "22px"
  label:
    fontFamily: "JetBrains Mono"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
rounded:
  sm: "8px"
  md: "10px"
  lg: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "14px"
---

<!-- Compatible with the Google Stitch DESIGN.md format (version alpha). Derived on 2026-10-27 from the existing code, not a new direction: the source of truth is src/theme/ (palette.ts, colorThemes.ts, fonts.ts). The tokens above are the default "terracotta" palette; the other five palettes override the accent tokens only. Values are React Native dp, written as px. -->

## Overview
A quiet, ledger-like tool: one monospace face for everything, neutral grey surfaces, and a single accent colour the user picks. The character comes from the monospace numbers and the user's own palette, not from decoration.

- **Audience and use:** one person, on their own Android or iOS phone, several times a week, to record income, expenses and transfers and check balances.
- **The one action:** record a transaction (and, for the Jar, distribute income into pockets).
- **Mode:** Operate everywhere. The unlock screen is the only standalone surface; it uses the cached palette so it matches the app.
- **Voice:** matter-of-fact, plain English, short labels; informal "you".
- **Off limits:** raw hex colours in screens (use `useAppTheme()`), a second font family, colour as the only carrier of meaning (income/expense also carry a sign or label), anything that suggests the data leaves the device.

## Colors
Semantic tokens live in `AppColors` (`src/theme/palette.ts`): `bg`, `surface`, `surfaceMuted`, `border`, `text`, `textSecondary`, `textMuted`, `primary`, `onPrimary`, `danger`, `success`, plus component tokens (chips, Jar banner, archived pockets, inputs, switches, pocket picker).

Six user-selectable palettes (`COLOR_THEME_ORDER`): `terracotta` (default, shown as "Orange"), `ocean`, `forest`, `slate`, `red`, `yellow`. Each has a light and a dark variant; the dark variant ("Black theme") uses near-black surfaces (`#0a0a0a`, `#141414`) and a lighter accent. Derived palettes change only accent-related tokens; neutrals, text, `danger` and `success` are shared.

Checked contrast (WCAG 2.2 AA, 2026-10-28, guarded by `tests/colorContrast.test.ts`):
- Every palette, light and dark, reaches 4.5:1 for `onPrimary` on `primary`, `primary` as text on `surface`, `chipText` on `chipBg`, `pocketPickTextSelected` on `pocketPickBgSelected`, `placeholder` on `inputBg`, and `jarHint` / `jarBannerTitle` on `jarSoftBg`; `text`, `textSecondary`, `textMuted` on `bg` stay at 5.4:1 or more.
- Light variants keep white `onPrimary` and a deep enough accent (`terracotta` `#c35311`, `forest` `#2c8646`, `yellow` `#956f08`); dark variants use a near-black `onPrimary` (`#0a0a0a`) on their lighter accent.
- Rule for new work: a new or changed palette must reach 4.5:1 for `onPrimary` on `primary`; the contrast test fails otherwise. Labels on `primary` use `onPrimary`, never a literal white.

**Chart palette** (`src/utils/pocketChartColors.ts`, guarded by `tests/chartColors.test.ts`): the theme accent plus seven fixed hues (blue, olive, purple, cyan, pink, amber, brown), one light and one dark set. Every colour reaches 3:1 (WCAG 1.4.11) on `bg`, `surface` and `surfaceMuted` of its own variant, and the hues stay apart (ΔE of 18 or more among the fixed ones, 12 or more from the accent). All charts, legends and category dots draw from it; hex literals are allowed only there and in `src/theme/`. A category keeps its colour as a hex, but it is drawn as the same slot of the current palette, so it follows light and dark.

## Typography
JetBrains Mono only (`@expo-google-fonts/jetbrains-mono`, SIL OFL, bundled with the app, no network fetch). `applyJetBrainsMonoDefaults()` sets Regular on every `Text` and `TextInput`; SemiBold and Bold are set explicitly with `font.semibold` / `font.bold`. The monospace face keeps amounts aligned without tabular-figure settings.

Scale in use (most to least frequent): 16 (body, inputs), 13 and 14 (labels, secondary rows), 15, 18, 12 (captions, chart axes and legends; the smallest size allowed, `style-scan` fails below it), 17, 20 to 22 (screen and section titles), 24 to 28 (balance totals). Text drawn inside a fixed-size chart caps its scaling with `maxFontSizeMultiplier`. Line height is mostly the React Native default; where set, multi-line body text uses 22 (on 16) and 20 for smaller text. Amounts are formatted with spaced thousands (`formatIntegerPartWithSpaces`).

## Layout
Single column, portrait only, screens inside `ScreenWithFooter`. Touch targets are 48 dp: small text links and glyph buttons get `hitSlop={HIT_SLOP}` (`src/utils/hitSlop.ts`), icon-only controls an `accessibilityLabel`, controls that repeat in a list one that names the item ("Edit Groceries"). Spacing steps in use: 4, 6, 8, 10, 12, 14, 16, 20, 24; the common rhythm is 16 screen and card padding, 8 to 12 between rows, 6 to 10 inside groups. New code picks from the token steps above (4, 8, 12, 16, 24) unless it sits next to an existing odd value.

## Elevation & Depth
Hierarchy comes from surface steps (`bg` → `surface` → `surfaceMuted`) and 1px `border` / `borderStrong` lines. Shadow is rare (three places, `elevation: 2`), mainly the Jar card tinted with `shadowJar`. Modals dim the screen with `modalOverlay`.

## Shapes
Radii in use: 8 (chips, small controls, bars), 10 (buttons, inputs, the most common), 12 and 14 (cards, sheets), 16 and 20 (large cards). Circles and pills use half of their size (dots, swatches, chips). Nested elements use a smaller radius than their container.

## Components
- **Buttons:** filled `primary` with `onPrimary` text for the main action; secondary actions as bordered or text buttons. Disabled and pressed states lower opacity (0.45 is the common disabled value).
- **Transaction rows** (`TransactionRow`, used by History, Jar and pocket detail): title and the signed amount on the first line (income `+` in `success`, expense `-`, a transfer signed only when seen from one of its pockets), category and pocket under it, the date last.
- **Section headings** (Settings): small uppercase accent text; a field label stays plain semibold, so the two levels differ.
- **Disabled primary buttons** turn into a muted, bordered surface with `textMuted` text, never a faded accent fill (the label has to stay readable).
- **Primary actions side by side:** a pocket's Income, Expense and Transfer sit in one row (the first two filled, Transfer outlined). A form puts the amount first, next to its asset.
- **`ModalSelectField`:** the one select pattern everywhere, including multi-select filter sheets (tap toggles a checkmark and keeps the sheet open; "All" clears and closes).
- **Collapsible filter panels** (History): summary chips (`chipBg` / `chipText`) when collapsed.
- **Pocket picker rows:** `pocketPick*` tokens; selected state uses border and text colour.
- **Charts:** `react-native-gifted-charts` for the balance line, the Jar's own SVG chart, and plain views for `MonthlyBarsChart` (income in chart slot 1, expense in slot 0, named in a text legend) and `RankedBarList`; no donuts (they cannot show a negative total). Value readout in a fixed row above the line chart (no floating tooltip; Android ScrollView clips overflow). A drawn chart is an `image` for screen readers with a one-sentence summary; a list next to it (the month list, the breakdown rows) is the readable version. Zero lines are drawn, so negative stretches are visible without colour.
- **Switches:** `switchTrack*` / `switchThumb*` tokens, never the platform default colours.
- **Selector chips** (`ModalSelectField` with `trigger="chip"`, Statistics): a `chipBg` pill showing only the value and `▾`; the label is read out, not shown. Tapping opens the usual sheet.
- **`SegmentedControl`:** two or three mutually exclusive options on `surfaceMuted`; the selected one is a `surface` tile with a `primary` border and semibold `primary` text, so the choice does not rest on colour alone. Radio semantics for screen readers.
- **`RankedBarList`:** a breakdown as rows (name, amount, share) with an 8 dp bar under each on `barTrack`, longest first, at most 7 before "Show all N". Preferred over a donut: it reads with many items and leaves negative totals as plain rows.

## Do's and Don'ts
- Do: take every colour from `useAppTheme()`; add a new token to `AppColors` and to all six palettes in both variants in the same change, and list it here.
- Do: show amounts in the monospace face with spaced thousands and an explicit sign or kind label.
- Don't: add a second typeface, gradients on content, or decorative motion.
- Don't: ship a palette or token pair below AA contrast (see Colors), or a chart colour below 3:1.
- `scripts/style-scan.mjs` (part of `scripts/check.sh`) enforces: no raw hex or colour literal outside the theme and chart palette, no literal font family, no font size under 12, no `LayoutAnimation`, no numeric `hitSlop`. A justified line carries `// style-ok: <reason>`.

## Motion
Almost none, by intent. The collapsible filter and settings panels animate with `LayoutAnimation.Presets.easeInEaseOut`; everything else changes instantly. Native-stack navigation uses the platform transitions. Panels animate only through `animateNextLayout()` (`src/utils/animateLayout.ts`), which skips the animation when the system asks for reduced motion; new motion must do the same.

## Platforms
Expo / React Native, Android first (also iOS). Navigation, back gesture and stack transitions follow the platform (`@react-navigation/native-stack`); colours, type and shapes are the app's own. Theme code: `src/theme/palette.ts` (token type), `colorThemes.ts` (palettes), `ThemeContext.tsx` (`useAppTheme()`), `appearanceCache.ts` (palette mirrored to SecureStore for the unlock screen), `fonts.ts` and `applyGlobalFont.ts`.
