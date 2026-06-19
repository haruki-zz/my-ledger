# Design System

本文档只记录视觉与交互规范。可复用组件 API 见 `docs/COMPONENTS.md`。

## Source Files

- `src/components/styles.ts`: color, typography, shared React Native styles, shadows, radii.
- `src/components/layout.ts`: responsive breakpoints and navigation dimensions.
- `src/lib/chartPalette.ts`: chart color sequence.

## Principles

- Light mode only.
- JetBrains Mono as the primary typeface.
- Glass/surface cards with restrained borders and shadows.
- Teal primary color, with indigo and warm orange accents.
- Minimum 44 px touch targets for main controls.
- Responsive navigation: mobile bottom floating bar, wide left sidebar.

## Colors

| Token | Value | Use |
| --- | --- | --- |
| `primary` | `#0F766E` | primary buttons, active controls, key chart color |
| `primaryDark` | `#115E59` | selected text, darker primary labels |
| `accent` | `#6366F1` | secondary accent |
| `warm` | `#C2410C` | warm accent and over-budget comparison |
| `danger` | `#DC2626` | destructive actions and errors |
| `bg` | `#F6F8FB` | page background |
| `surface` | `#FFFFFF` | solid cards, sheets, rows |
| `glass` | `rgba(255,255,255,0.76)` | glass cards and nav bars |
| `glassBorder` | `rgba(255,255,255,0.72)` | glass borders |
| `tint` | `rgba(15,118,110,0.10)` | active tinted backgrounds |
| `ink` | `#111827` | primary text |
| `muted` | `#667085` | secondary text |
| `subtle` | `#98A2B3` | tertiary text |
| `line` | `rgba(17,24,39,0.08)` | dividers and borders |

Chart sequence from `src/lib/chartPalette.ts`:

```text
#0F766E #6366F1 #14B8A6 #F59E0B #EF4444 #8B5CF6 #22C55E
#2563EB #D946EF #F97316 #06B6D4 #84CC16 #E11D48 #64748B
```

## Typography

Font families from `fontFamilies`:

- `regular`: `JetBrainsMono_400Regular`
- `semiBold`: `JetBrainsMono_600SemiBold`
- `bold`: `JetBrainsMono_700Bold`
- `extraBold`: `JetBrainsMono_800ExtraBold`
- `fallback`: `Menlo`

Shared text styles from `styles`:

| Style | Size | Weight | Use |
| --- | ---: | --- | --- |
| `title` | 30 | 800 | screen titles |
| `h1` | 24 | 700 | major headings |
| `h2` | 18 | 700 | card headings |
| `body` | 16 | 400 | normal body text |
| `muted` | 14 | 400 | supporting copy |
| `label` | 14 | 700 | form labels |
| `upperLabel` | 10 | 800 | uppercase section labels |
| `buttonText` | 16 | 700 | primary buttons |
| `error` | 14 | 400 | error text |

## Layout

| Constant | Value | Defined in |
| --- | ---: | --- |
| `FLOATING_TAB_BAR_HEIGHT` | 72 | `layout.ts` |
| `FLOATING_TAB_MARGIN` | 20 | `layout.ts` |
| `CONTENT_BOTTOM_PADDING` | 104 | `layout.ts` |
| `SIDEBAR_WIDTH` | 96 | `layout.ts` |
| `WIDE_LAYOUT_BREAKPOINT` | 768 | `layout.ts` |

Common page styling:

- `styles.page`: full-screen background.
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

- `theme.shadow`: base elevated shadow.
- `theme.glassShadow`: glass card shadow.
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
