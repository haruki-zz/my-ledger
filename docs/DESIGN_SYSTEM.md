# Design System

This document records the app-wide visual system. Component APIs are documented in `docs/COMPONENTS.md`.

## Source Files

- `src/components/styles.ts`: color, typography, shared React Native styles, shadows, radii.
- `src/components/layout.ts`: responsive breakpoints and navigation dimensions.
- `src/lib/entityColors.ts`: member identity colors.
- `src/lib/categorySystem.ts`: primary category metadata and category colors.
- `src/lib/chartPalette.ts`: fallback chart color sequence.

## Principles

- Light mode only.
- Dual-font system:
  - Hanken Grotesk for readable UI text.
  - JetBrains Mono for the receipt/data layer: amounts, codes, dates, times, percentages, and compact identity tags.
- Warm paper surfaces with espresso primary chrome and one ochre accent for active/selected states.
- User identity colors are separate from semantic success/danger colors.
- Category colors carry most of the app's color identity.
- Minimum 44 px touch targets for main controls.
- Responsive navigation: mobile bottom floating bar, wide left sidebar.

## Colors

| Token | Value | Use |
| --- | --- | --- |
| `primary` | `#3A322A` | solid primary buttons, FABs, primary text/icons |
| `primaryDark` | `#2A241E` | pressed or darker espresso ink |
| `secondary` | `#C0892E` | selected/active glyphs, borders, highlights |
| `accent` | `#C0892E` | alias for ochre accent |
| `danger` | `#C0392B` | destructive actions, errors, over-budget status |
| `warning` | `#D2741F` | warning and failed sync status |
| `success` | `#3D8A5E` | OK, synced, under-budget status |
| `info` | `#3F6FA0` | informational status |
| `bg` | `#F1ECE3` | warm paper page background |
| `surface` | `#FFFFFF` | solid cards, sheets, rows |
| `glass` | `#FFFFFF` | glass cards and nav bars |
| `glassBorder` | `rgba(42,39,34,0.06)` | glass borders |
| `tint` | `rgba(192,137,46,0.12)` | selected/active tinted backgrounds |
| `ink` | `#2A2722` | primary text |
| `muted` | `#5C544A` | secondary text |
| `subtle` | `#9A8F80` | tertiary text |
| `line` | `rgba(42,39,34,0.10)` | dividers and borders |

User identity colors:

```text
current user: #B25A3C
partner:      #3F8A86
fallbacks:    #7C4A66 #4338CA #A16207 #7F1D1D #581C87
```

Category and chart fallback sequence:

```text
#CB5F43 #8AA248 #4F77BE #8A6FB6 #D2A032 #4E97B5
#4FA670 #A85DA8 #C9628F #3FA29A #9A8F84
```

## Typography

Font families from `fontFamilies`:

- `regular`: `HankenGrotesk_400Regular`
- `medium`: `HankenGrotesk_500Medium`
- `semiBold`: `HankenGrotesk_600SemiBold`
- `bold`: `HankenGrotesk_700Bold`
- `extraBold`: `HankenGrotesk_800ExtraBold`
- `mono`: `JetBrainsMono_400Regular`
- `monoSemiBold`: `JetBrainsMono_600SemiBold`
- `monoBold`: `JetBrainsMono_700Bold`
- `monoExtraBold`: `JetBrainsMono_800ExtraBold`
- `fallback`: platform monospace fallback

Shared text styles from `styles`:

| Style | Size | Weight | Font | Use |
| --- | ---: | --- | --- | --- |
| `title` | 30 | 700 | Hanken bold | screen titles |
| `h1` | 24 | 700 | Hanken bold | major headings |
| `h2` | 18 | 600 | Hanken semiBold | card headings |
| `body` | 16 | 400 | Hanken regular | normal body text |
| `muted` | 14 | 400 | Hanken regular | supporting copy |
| `label` | 14 | 600 | Hanken semiBold | form labels |
| `upperLabel` | 11.5 | 700 | Hanken bold | uppercase section labels, 0.4 tracking |
| `buttonText` | 16 | 700 | Hanken bold | primary buttons |
| `error` | 14 | 400 | Hanken regular | error text |

Use JetBrains Mono for amounts, invite codes, app version text, month/date/time tokens, percentages, numeric inputs, split values, member identity pills, user legend tags, and compact badges.

## Layout

| Constant | Value | Defined in |
| --- | ---: | --- |
| `FLOATING_TAB_BAR_HEIGHT` | 72 | `layout.ts` |
| `FLOATING_TAB_MARGIN` | 20 | `layout.ts` |
| `CONTENT_BOTTOM_PADDING` | 104 | `layout.ts` |
| `SIDEBAR_WIDTH` | 96 | `layout.ts` |
| `WIDE_LAYOUT_BREAKPOINT` | 768 | `layout.ts` |

Common page styling:

- `styles.page`: full-screen warm paper background.
- `styles.content`: max width 1040, centered, 20 px padding, bottom padding for nav.
- Settings detail screens often use max width 720 for form-like layouts.

## Radius And Shadows

| Token | Value |
| --- | ---: |
| `theme.radii.control` | 16 |
| `theme.radii.compact` | 12 |
| `theme.radii.surface` | 20 |
| `theme.radii.pill` | 999 |

Main shadows:

- `theme.shadow`: base elevated shadow using warm ink.
- `theme.glassShadow`: glass card shadow using warm ink.
- `theme.daySectionShadow`: History grouped day rows.

## Reusable Patterns

Use these existing primitives before adding new one-off UI:

- `BentoCard`: base glass/surface card; variants `default`, `hero`, `chart`, `list`, `form`, `danger`.
- `PillTabs`: segmented control with animated indicator.
- `IconButton`: icon-only button with `sm`, `md`, `lg` sizes and tone/variant support.
- `ToggleSwitch`: binary switch.
- `SwipeExpenseRow`: expense row with swipe, press, long-press context menu, and accessibility actions.
- `KeyboardAwareScrollView`, `KeyboardDoneAccessory`, `AndroidKeyboardDoneButton`: keyboard handling helpers.

## Navigation UI

`app/(tabs)/_layout.tsx` implements:

- Mobile: floating bottom bar, 72 px height, bottom safe-area aware.
- Wide layout: 96 px left sidebar at widths `>= 768`.
- Draggable add button: floating `+` button that opens `/expenses/new`; it docks left/right and is constrained by viewport and safe areas.

## Chart UI

- `PieChart` uses category stats and shows category rows; pressing rows can select categories.
- `DailyChart` draws member-specific daily line/bar style data using `react-native-svg`.
- User/member colors come from `src/lib/entityColors.ts`.

## Interaction Conventions

- Month navigation uses chevron icon buttons and horizontal swipe gestures.
- Expense rows support tap-to-edit, swipe right to edit, swipe left to delete, and long press for context actions.
- Fixed expense and account screens use form cards with direct save buttons.
- Destructive actions use `Alert` confirmation before deleting/leaving/signing out with unsynced data.
