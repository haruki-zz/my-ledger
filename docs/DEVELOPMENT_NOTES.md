# Development Notes

本文档收集后续开发容易踩坑或需要先知道的信息。

## Environment

Required env vars:

```text
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

`app/index.tsx` checks these through `isSupabaseConfigured`; missing values render a configuration error instead of entering the app.

## Commands

```bash
npm install
npm start
npm run ios
npm run android
npm run web
npm run typecheck
npm run lint
npm run test
```

## Supabase And JS Engine Workaround

`app.json` sets the JS engine to JSC. `package.json` also runs `scripts/fix-supabase.cjs` on `postinstall`.

Reason: this project has a Supabase OTEL dynamic import workaround. Re-check this when upgrading `@supabase/supabase-js`.

## Offline Sync Rules

Current offline-capable entity types are defined in `src/lib/syncQueue.ts`:

```ts
type SyncEntityType = 'expense' | 'category' | 'recurring_rule';
type SyncAction = 'create' | 'edit' | 'delete';
```

User-facing status appears at `/settings/sync`.

Conflict behavior:

- Remote RPCs use `p_base_updated_at`.
- Conflict-like failures are classified by `classifySyncError`.
- Users can retry, force local, or discard local from Sync Status.

## Local SQLite

Local DB file: `my-ledger-offline.db`.

Schema version: `5`.

On web, SQLite open has a timeout. If unavailable, the app falls back to remote reads where possible and shows retry controls in Sync Status.

## Categories

Canonical category data lives in `src/lib/categorySystem.ts`.

Important: `expenses.category_id` is the preferred category key. `expenses.category` remains as a legacy/display fallback. New code should avoid treating `category` as canonical.

There is no current `/settings/categories` screen.

## Fixed Expenses

Fixed expense rules are stored in `recurring_expense_rules` and edited at `/settings/recurring`.

Generation is triggered from:

- `LedgerProvider` when active ledger changes.
- Dashboard load.
- History load.
- Settings fixed expense toggle/save.

UI uses `Asia/Tokyo` as default timezone when saving rules.

## Transfer Checklist

Transfer checklist rows are computed by the Supabase RPC `get_open_transfer_items`.

Completion state is saved by `set_transfer_confirmations`. This action currently requires network; it is not queued offline.

## Route Gotchas

Expo Router route group `app/(tabs)` maps to the main authenticated tab UI. The default tab route is reachable as both:

- `/(tabs)`
- `/(tabs)/index`

Older docs or ideas may mention routes that do not exist now:

- `/settings/categories`
- `/settings/ledger/[id]`

Use `docs/UI_ROUTES.md` as the current route reference.

## Adding New Screens

For a normal authenticated ledger screen:

1. Add the route file under `app/`.
2. Register stack options in `app/_layout.tsx` when it needs custom header/title/presentation.
3. Use `useRequiredLedger()` unless the screen is auth/ledger setup.
4. Prefer shared UI from `src/components/ui.tsx`.
5. Add the route to `docs/UI_ROUTES.md`.

## Adding New Business APIs

Preferred placement:

- Screen-specific derived data: `src/hooks/*`.
- App-facing data operation: `src/lib/ledger.ts`.
- Local cache/offline internals: `src/lib/localRepository.ts`.
- Pure data transforms: `src/lib/stats.ts`, `src/lib/recurring.ts`, or a focused helper.

For offline-capable writes, update all of these together:

- local SQLite table/schema if needed,
- local write function,
- sync queue payload type,
- `syncQueueRow` drain behavior,
- Supabase RPC/migration,
- TypeScript schema in `src/types/database.ts`,
- Sync Status behavior/tests if queue semantics change.

## Verification

Before merging code changes, run:

```bash
npm run typecheck
npm run lint
npm run test
```

For route/UI changes, manually check:

- `/`
- `/auth`
- `/ledger`
- `/(tabs)/index`
- `/(tabs)/history`
- `/(tabs)/settings`
- `/expenses/new`
- relevant settings detail screen
