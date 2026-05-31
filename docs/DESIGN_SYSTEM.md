# Design System

Visual design language for My Ledger v1.0. All values referenced here are defined in `src/components/styles.ts` and `src/components/layout.ts`. Future UI/UX work should maintain consistency with this system.

## Design Principles

- **Monospace-first typography** - JetBrains Mono throughout, giving the app a technical, precise aesthetic
- **Glassmorphism** - semi-transparent surfaces with subtle borders and soft shadows create depth
- **Teal primary** - a calm, professional teal anchors the color system
- **Spring animations** - physics-based springs for all interactive motion (swipe, drag, tab transitions)
- **Light mode only** - clean, bright backgrounds; no dark mode in v1.0

## Color Palette

### Core Colors

| Token | Value | Usage |
|-------|-------|-------|
| `primary` | `#0F766E` | Buttons, navigation, active states, charts |
| `primaryDark` | `#115E59` | Button text on secondary surfaces, selected text |
| `accent` | `#6366F1` | Secondary actions, personal expense badge |
| `warm` | `#C2410C` | Tertiary accent |
| `danger` | `#DC2626` | Destructive actions, errors, delete buttons |

### Surfaces & Backgrounds

| Token | Value | Usage |
|-------|-------|-------|
| `bg` | `#F6F8FB` | Page background |
| `surface` | `#FFFFFF` | Card backgrounds, solid surfaces |
| `glass` | `rgba(255,255,255,0.76)` | Glassmorphic cards and panels |
| `glassBorder` | `rgba(255,255,255,0.72)` | Borders on glass surfaces |
| `tint` | `rgba(15,118,110,0.10)` | Active/selected state backgrounds |

### Text

| Token | Value | Usage |
|-------|-------|-------|
| `ink` | `#111827` | Primary text |
| `muted` | `#667085` | Secondary text, labels |
| `subtle` | `#98A2B3` | Tertiary text, placeholders |
| `line` | `rgba(17,24,39,0.08)` | Dividers, borders |

### Chart Palette

14 colors used for chart series, in order:

```
#0F766E  #6366F1  #14B8A6  #F59E0B  #EF4444  #8B5CF6  #22C55E
#2563EB  #D946EF  #F97316  #06B6D4  #84CC16  #E11D48  #64748B
```

## Typography

**Font family**: JetBrains Mono (monospace)
- Fallback: Menlo (iOS), monospace (Android)

### Type Scale

| Style | Size | Weight | Family | Extra |
|-------|------|--------|--------|-------|
| `title` | 30px | 900 | ExtraBold | - |
| `h1` | 24px | 900 | ExtraBold | - |
| `h2` | 18px | 700 | Bold | - |
| `body` | 16px | 400 | Regular | lineHeight: 23 |
| `muted` | 14px | 400 | Regular | lineHeight: 20, color: muted |
| `label` | 14px | 700 | Bold | - |
| `upperLabel` | 10px | 800 | ExtraBold | letterSpacing: 1.4, uppercase |
| `buttonText` | 16px | 800 | ExtraBold | - |
| `error` | 14px | 400 | Regular | color: danger |

### Contextual Sizes

| Context | Size | Weight |
|---------|------|--------|
| Hero amount (dashboard) | 38px | 900 |
| Metric value | 34px | 900 |
| Month label | 30px | 900 |
| Amount input (form) | 28px | 900 |
| Swipe row amount | 23px | 900 |
| Swipe row category | 20px | 900 |
| Chart axis labels | 10px | - |

## Spacing

### Layout Constants

| Constant | Value |
|----------|-------|
| Floating tab bar height | 72px |
| Floating tab margin | 20px |
| Content bottom padding | 104px (72 + 20 + 12) |
| Sidebar width (wide layout) | 96px |
| Wide layout breakpoint | 768px |
| Max content width | 1040px |

### Standard Spacing

| Usage | Value |
|-------|-------|
| Page content padding | 20px |
| Section gap (between cards) | 18px |
| Card internal padding | 16px |
| Form card padding | 20px |
| Input padding | 12px horizontal, 10px vertical |
| Button padding | 14px horizontal, 12px vertical |
| Row gap (within sections) | 10-12px |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `control` | 16px | Buttons, inputs, dropdowns, tabs |
| `compact` | 12px | Keyboard accessories, small controls |
| `surface` | 20px | Cards, modals, glass panels |

### Component-Specific

| Component | Radius |
|-----------|--------|
| Floating tab bar | 28px |
| Sidebar items | 22px |
| Pill tabs | 18px |
| Filter chips | 18px |
| Icon button (lg) | 22px |
| Icon button (md) | 18px |
| Icon button (sm) | 14px |
| Expense badges | 9px |
| Legend dots | 4px |

## Shadows

Single shadow definition applied to all elevated surfaces:

```
shadowColor: #0F172A
shadowOffset: { width: 0, height: 12 }
shadowOpacity: 0.08
shadowRadius: 24
elevation: 3 (Android)
```

Floating button uses a stronger shadow:
```
shadowOffset: { width: 0, height: 6 }
shadowOpacity: 0.18
shadowRadius: 14
```

## Component Patterns

### Glass Surface (base pattern)

The foundational card/panel pattern used throughout the app:

```
background: rgba(255,255,255,0.76)
border: 1px solid rgba(255,255,255,0.72)
borderRadius: 20px
shadow: standard elevation
```

### BentoCard Variants

Built on the glass surface pattern with variant-specific overrides:

| Variant | Modifications |
|---------|--------------|
| `default` | Standard glass surface |
| `hero` | minHeight: 320px, padding: 18px |
| `chart` | minHeight: 268px |
| `list` | gap: 12px |
| `form` | gap: 14px |
| `danger` | border: rgba(220,38,38,0.18) |

### Buttons

| Type | Background | Text Color | Min Height |
|------|-----------|------------|------------|
| Primary | `#0F766E` | white | 48px |
| Secondary | `rgba(255,255,255,0.72)` + 1px border | primaryDark | 48px |
| Danger | `#DC2626` | white | 48px |

### Input Fields

```
background: rgba(255,255,255,0.86)
border: 1px solid line
borderRadius: 16px (control)
minHeight: 48px
padding: 12px horizontal, 10px vertical
fontSize: 16px
```

### PillTabs

```
track: rgba(15,118,110,0.08), border 1px line, borderRadius 18px, height 38px
indicator: white bg, 1px line border, borderRadius 14px, spring-animated
```

### Expense Badges

| Type | Background | Text Color |
|------|-----------|------------|
| Shared | `rgba(15,118,110,0.10)` | primaryDark |
| Personal | `rgba(99,102,241,0.12)` | `#4F46E5` |

### Filter Chips

```
background: rgba(255,255,255,0.82)
active background: tint
border: 1px line (inactive), 1px primary (active)
height: 44px, borderRadius: 18px, padding: 16px horizontal
```

### Icon Buttons

| Size | Dimensions | Radius |
|------|-----------|--------|
| sm | 30x30 | 14px |
| md | 38x38 | 18px |
| lg | 48x48 | 22px |

Variants: glass, solid, ghost. Tones: primary, neutral, danger.

### Swipe Expense Row

```
card: surface bg, 1px glassBorder, borderRadius 20px, minHeight 122px
edit action: primary bg (#0F766E), width 96px
delete action: #EF4444, width 96px
```

### Settings Rows

```
minHeight: 84px, padding: 20px horizontal / 14px vertical
icon container: 40x40, borderRadius 14px, background tint
gap: 12px between icon and text
```

### Modals

```
overlay: rgba(23,32,42,0.36)
panel: glass surface, borderRadius 20px, max-width 440px
padding: 18px, gap: 16px
```

### Dropdowns

```
trigger: same as input styling
menu: rgba(255,255,255,0.96), 1px line border, borderRadius 16px, shadow
option: minHeight 44px, padding 12px/10px
active option: tint bg, primaryDark text, weight 800
```

## Navigation Bars

### Floating Tab Bar (mobile)

```
background: glass
border: 1px glassBorder
height: 72px
borderRadius: 28px
position: absolute bottom, left/right 20px
gap: 4px between tabs, 8px padding
```

### Sidebar (wide layout, >= 768px)

```
width: 96px
background: glass
border: 1px right glassBorder
items: 72x66px, borderRadius 22px
logo mark: primary bg, 44x44, borderRadius 20px
```

## Animations

### Spring Parameters

All gesture-driven animations use spring physics:

| Context | Damping | Mass | Stiffness |
|---------|---------|------|-----------|
| PillTabs indicator | 18 | 0.72 | 190 |
| SwipeExpenseRow | 18 | 0.8 | 180 |
| Draggable button | 18 | 0.8 | 180 |

### Timing Animations

| Context | Duration | Properties |
|---------|----------|-----------|
| Modal open | 260ms | scale: 0.94 -> 1, opacity: 0 -> 1 |
| Modal close | 200ms | opacity: 1 -> 0 |
| Dashboard drill | 240ms | translateY: 10, scale: 0.985 -> 1 |

### Press Feedback

| Context | Opacity | Scale |
|---------|---------|-------|
| Icon buttons | 0.78 | 0.96 |
| Tab items | 0.76 | 0.97 |
| Action rows | 0.78 | 0.995 |

### Gesture Thresholds

| Gesture | Trigger Distance | Notes |
|---------|-----------------|-------|
| Month swipe | 36px | direction ratio 2.5x, velocity 0.35 |
| Expense swipe | 86px (90% of 96px action width) | max translate 116px |

## Charts

### Daily Chart

```
canvas: 320x190px
grid: 1px, grid color
bars: width 3-18px (calculated), borderRadius 3px
curve: strokeWidth 3px, strokeLinecap round
area fill: rgba(15,118,110,0.10)
axis labels: 10px
```

### Pie Chart

```
donut center: rgba(255,255,255,0.92)
legend dots: 12x12, borderRadius 4px
category rows: borderRadius 8px, pressable -> tint bg
```

## Responsive Design

Two layout modes based on window width:

| Mode | Breakpoint | Navigation | Content |
|------|-----------|-----------|---------|
| Mobile | < 768px | Floating bottom tab bar | Full width, 20px padding |
| Wide | >= 768px | Left sidebar (96px) | Max 1040px, centered |

The draggable "add expense" button appears on mobile only, docking to left or right edge.

## Minimum Touch Targets

All interactive elements maintain a minimum of 44px touch target (following Apple HIG), enforced via `minHeight` on buttons, inputs, dropdown options, and filter chips.
