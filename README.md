# My Ledger

A shared expense tracker for couples. Built with Expo React Native and Supabase.

## Features

- **Shared ledgers** - create a ledger and invite your partner with an 8-character code (max 2 members)
- **Expense tracking** - record amount (JPY), category, payer, date, and notes
- **Split expenses** - shared costs split by amount or ratio, stored as each person's JPY portion
- **Dashboard** - monthly total, category pie chart, daily trend (line or bar), range filter (Both / Me / Partner)
- **History** - swipe-to-edit/delete, filter by user, category, or date range
- **Custom categories** - per-ledger category list with configurable default split ratios
- **Realtime sync** - changes appear on both devices instantly via Supabase subscriptions
- **Multi-ledger** - create, join, and switch between multiple ledgers

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Expo 56, React Native 0.85, TypeScript |
| Backend | Supabase (PostgreSQL, Auth, Realtime) |
| Router | Expo Router (file-based) |
| Charts | Custom SVG (react-native-svg) |
| Typography | JetBrains Mono |

## Getting Started

### Prerequisites

- Node.js >= 18
- Xcode (for iOS) or Android Studio (for Android)
- A [Supabase](https://supabase.com) project

### Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Fill in your Supabase project URL and anon key:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

3. **Run database migrations**

   ```bash
   supabase db push
   ```

   Or paste the SQL files from `supabase/migrations/` into the Supabase SQL Editor manually.

4. **Enable email auth** in your Supabase project's Authentication settings.

### Run

```bash
# Native build (requires Xcode / Android Studio)
npm run ios
npm run android

# Expo Go preview
npm start

# Web
npm run web
```

### Verify

```bash
npm run typecheck
npm run lint
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - project structure, database schema, features, and design decisions
- [Design System](docs/DESIGN_SYSTEM.md) - color palette, typography, spacing, component patterns, and animation specs

## Notes

- Currency is JPY only (integer amounts, no decimals).
- Deletes are hard deletes (no trash / undo).
- JS engine is set to JSC to work around a Hermes + Supabase OTEL dynamic import issue. The `postinstall` script patches the affected file as an additional safeguard. Re-evaluate this workaround when upgrading `@supabase/supabase-js`.

## License

Private.
