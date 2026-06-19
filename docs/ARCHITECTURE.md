# Architecture

Source code reference for My Ledger v1.0. This document describes the project structure, each file's responsibility, and the features implemented in this release.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo 56 + React Native 0.85 |
| Language | TypeScript 6 |
| Router | Expo Router (file-based) |
| Backend | Supabase (PostgreSQL, Auth, Realtime) |
| State | React Context + AsyncStorage |
| Charts | Custom SVG (react-native-svg) |
| Typography | JetBrains Mono |
| JS Engine | JSC (explicit; Hermes disabled due to OTEL dynamic import issue) |

## Directory Structure

```
my-ledger/
├── app/                        # Expo Router pages
│   ├── _layout.tsx             # Root layout: font loading, providers, stack config
│   ├── index.tsx               # Splash / auth-gate: redirects to auth, ledger, or tabs
│   ├── auth.tsx                # Sign-in / sign-up form
│   ├── ledger.tsx              # Create or join a ledger (shown on first login)
│   ├── (tabs)/                 # Main tab navigation group
│   │   ├── _layout.tsx         # Custom tab bar (floating bottom / sidebar)
│   │   ├── index.tsx           # Dashboard screen
│   │   ├── history.tsx         # Expense history with filters
│   │   └── settings.tsx        # Settings hub
│   ├── expenses/
│   │   ├── new.tsx             # Create new expense
│   │   └── [id].tsx            # Edit existing expense
│   └── settings/
│       ├── account.tsx         # Profile name, email, sign-out
│       ├── categories.tsx      # Category management & split ratios
│       ├── ledgers.tsx         # Create / join / switch ledgers
│       └── ledger/[id].tsx     # Ledger details, members, invite code
├── src/
│   ├── components/
│   │   ├── styles.ts           # Design tokens: colors, typography, radii, shadows
│   │   ├── layout.ts           # Layout constants: breakpoints, bar heights
│   │   ├── ui.tsx              # Shared UI primitives (BentoCard, PillTabs, etc.)
│   │   ├── ExpenseForm.tsx     # Expense create/edit form with split logic
│   │   ├── PieChart.tsx        # Category breakdown donut chart
│   │   ├── DailyChart.tsx      # Daily spending line/bar chart
│   │   ├── CategoryTrendModal.tsx        # Modal for per-category trends
│   │   ├── CategoryMonthlyTrendChart.tsx # Monthly trend chart component
│   │   ├── KeyboardDoneAccessory.tsx     # iOS keyboard "Done" toolbar
│   │   └── KeyboardAwareScrollView.tsx   # Keyboard-reactive scroll wrapper
│   ├── context/
│   │   ├── AuthContext.tsx     # Supabase session, auth state listener
│   │   └── LedgerContext.tsx   # Active ledger selection, CRUD, persistence
│   ├── hooks/
│   │   ├── useDashboardData.ts # Dashboard data loading + realtime subscriptions
│   │   ├── useCategoryTrend.ts # Category trend data loading
│   │   └── useRequiredLedger.ts # Auth + ledger guard with redirect
│   ├── lib/
│   │   ├── supabase.ts        # Supabase client initialization
│   │   ├── ledger.ts          # All Supabase RPC wrappers and query functions
│   │   ├── stats.ts           # Dashboard stat computation (totals, categories, daily)
│   │   ├── format.ts          # Formatting: currency (JPY), dates, display names
│   │   ├── categories.ts     # Default category list and split ratio defaults
│   │   ├── keyboard.ts       # runAfterKeyboardDismiss helper
│   │   └── chartPalette.ts   # Color array for chart series
│   └── types/
│       └── database.ts       # TypeScript types mirroring Supabase schema
├── supabase/migrations/       # PostgreSQL migration files
│   ├── 20260523000000_initial_ledger_schema.sql
│   ├── 20260523100000_ledger_categories.sql
│   ├── 20260526111054_ledger_management.sql
│   └── 20260528073153_english_defaults.sql
├── assets/                    # App icons, splash, favicon
├── scripts/
│   └── fix-supabase.cjs       # Postinstall: removes OTEL dynamic import
├── package.json
├── app.json
└── tsconfig.json
```

## Navigation

```
Root Stack (_layout.tsx)
├── index           → auth gate → redirects based on session / ledger state
├── auth            → email/password sign-in or sign-up
├── ledger          → create or join a ledger
├── (tabs)          → main app
│   ├── Dashboard   → monthly totals, pie chart, daily trend
│   ├── History     → filtered expense list with swipe actions
│   └── Settings    → links to sub-screens
├── expenses/new    → new expense form (modal)
├── expenses/[id]   → edit expense form
├── settings/account
├── settings/categories
└── settings/ledgers → create, join, switch, delete, and leave ledgers
```

Mobile uses a floating bottom tab bar; screens wider than 768px switch to a left sidebar.

## Database Schema

Six tables with RLS enabled:

### profiles
Auto-created on Supabase Auth sign-up via trigger.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | References auth.users |
| display_name | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | Auto-updated via trigger |

### ledgers

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | |
| invite_code | char(8) | Unique, auto-generated |
| created_by | uuid FK | References profiles |
| created_at / updated_at | timestamptz | |

### ledger_members
Composite PK: (ledger_id, user_id). Max 2 members enforced in RPC.

### expenses

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| ledger_id | uuid FK | |
| amount_yen | int | > 0 |
| category | text | Free-form |
| paid_by | uuid FK | Who paid |
| recorded_by | uuid FK | Immutable after insert (trigger-enforced) |
| ownership | enum | 'personal' or 'shared' |
| spent_on | date | |
| note | text | Optional |

Indexed on `(ledger_id, spent_on DESC, created_at DESC)`.

### expense_splits
Composite PK: (expense_id, user_id). Stores each member's JPY portion for shared expenses.

### ledger_categories
Per-ledger custom categories with `split_ratio_a` / `split_ratio_b` (0-100) and `sort_order`.

### RPC Functions
- `create_ledger(name)` - creates ledger + adds creator as member
- `join_ledger_by_invite(code)` - joins existing ledger (max 2 members)
- `leave_ledger(ledger_id)` - removes membership
- `delete_ledger(ledger_id)` - owner-only, cascading delete
- `seed_default_categories(ledger_id)` - seeds 11 default categories
- `save_ledger_category(...)` - upsert category with split ratios
- `delete_ledger_category(...)` - delete category
- `save_expense(...)` - create or update expense with splits
- `delete_expense(id)` - hard delete

## State Management

### Contexts (global)
- **AuthContext** - Supabase session, `loading`, `signOut()`
- **LedgerContext** - active ledger ID (persisted to AsyncStorage), memberships list, CRUD operations

### Realtime Subscriptions
Dashboard, history, and categories screens subscribe to Supabase Postgres Changes for automatic cross-device sync. Subscriptions are scoped to the active ledger and cleaned up on unmount.

### Data Flow
1. Screens call hooks (`useDashboardData`, `useCategoryTrend`) to load data
2. Hooks query Supabase and subscribe to realtime changes
3. `useMemo` derives computed stats (monthly totals, category breakdowns, daily series)
4. Write operations go through `src/lib/ledger.ts` RPC wrappers

## Features (v1.0)

### Authentication
- Email/password sign-up with display name
- Email/password sign-in
- Session persistence via AsyncStorage
- Sign-out

### Ledger Management
- Create shared ledger (generates 8-char invite code)
- Join ledger by invite code
- Switch between multiple ledgers
- Leave ledger / delete ledger (owner only)
- Max 2 members per ledger

### Expense Tracking
- Create expense: amount (JPY), category, paid-by, ownership (personal/shared), date, note
- Edit expense (preserves original recorder)
- Delete expense (hard delete)
- Split modes for shared expenses: by amount or by ratio
- Split validation: sum of parts must equal total

### Dashboard
- Monthly total with expense count
- Range filter: Both / Me / Partner
- Category breakdown pie chart (tap category for trend)
- Daily spending line or bar chart
- Month navigation (swipe or buttons)

### History
- Chronological expense list with swipe-to-edit / swipe-to-delete
- Filters: user, category, date range
- Summary card with total and record count
- Realtime refresh

### Categories
- Per-ledger category list with custom split ratios
- Add / edit / delete categories
- Default seed of 11 categories for new ledgers
- Realtime sync across members

### Settings
- Profile name editing
- Current ledger info with member count
- Share invite code (native share sheet)
- Navigation to account, ledgers, categories sub-screens

## Key Design Decisions

1. **JPY only** - all amounts are integers, no decimal handling needed
2. **Max 2 members** - enforced at the database RPC level
3. **Hard deletes** - no soft-delete / trash; expenses and categories are permanently removed
4. **Immutable recorder** - `recorded_by` is set on insert and protected by a database trigger
5. **JSC engine** - Hermes disabled to work around a Supabase OTEL dynamic import issue; `postinstall` script patches the affected file as an additional safeguard
6. **No external state library** - React Context + local state + Supabase realtime is sufficient for this app's complexity
7. **Custom charts** - SVG-based charts built with react-native-svg; no chart library dependency
