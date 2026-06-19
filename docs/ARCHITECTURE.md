# Architecture Overview

本文档只描述整体架构和数据流。文件级说明见 `docs/FILE_STRUCTURE.md`，可达 UI 见 `docs/UI_ROUTES.md`，API 和可复用模块见 `docs/API_REFERENCE.md`、`docs/COMPONENTS.md`。

## App Summary

`my-ledger` 是一个面向两人共享账本的 Expo React Native App。核心能力包括：

- Supabase Auth 邮箱密码登录/注册。
- 多账本创建、加入、切换、退出、删除。
- 日常支出新增、编辑、删除，支持个人/共享支出和按金额拆分。
- Dashboard 展示 today/week/month 总额、成员分摊、分类占比、每日趋势。
- History 按月份、成员、分类筛选支出，并支持详情、拆分明细、滑动/长按操作。
- Fixed Expense 管理每月固定支出规则，并按规则生成当月支出。
- Transfer Checklist 计算两人间待确认转账项。
- 本地 SQLite 缓存和离线写入队列，网络恢复后同步到 Supabase。

## Runtime Stack

| Layer | Current choice |
| --- | --- |
| App framework | Expo 56 + React Native 0.85 |
| Router | Expo Router file-based routes |
| Language | TypeScript 6 |
| Backend | Supabase Auth, PostgreSQL, Realtime |
| Local cache | `expo-sqlite` |
| Network state | `@react-native-community/netinfo` |
| Persistence | AsyncStorage for active ledger id; SQLite for business data |
| Icons | `@expo/vector-icons` Ionicons |
| Charts | Custom `react-native-svg` charts |
| Font | JetBrains Mono |

## Provider Tree

Root layout `app/_layout.tsx` wraps the entire stack in:

1. `AuthProvider`
2. `SyncProvider`
3. `LedgerProvider`

Provider responsibilities:

- `AuthProvider`: Supabase session, auth state subscription, sign out, local business data cleanup.
- `SyncProvider`: network state, sync queue summary, sync conflict banner, queue draining.
- `LedgerProvider`: active ledger selection, ledger membership loading, ledger-level realtime refresh, recurring generation on ledger activation.

## Data Flow

Read path:

1. Screens call hooks or API wrappers from `src/lib/ledger.ts`.
2. `ledger.ts` first attempts local SQLite-backed reads through `src/lib/localRepository.ts`.
3. If SQLite is unavailable, it falls back to direct Supabase reads.
4. Realtime changes update local cache through `LedgerProvider` and notify screens via `src/lib/localEvents.ts`.
5. UI derives display state with pure helpers in `src/lib/stats.ts`, `src/lib/categorySystem.ts`, and `src/lib/format.ts`.

Write path:

1. Expense and recurring-rule writes go through `src/lib/ledger.ts`.
2. `ledger.ts` delegates to local repository write functions.
3. Local write updates SQLite immediately and enqueues a `sync_queue` mutation.
4. `SyncProvider` drains the queue when online.
5. Queue rows call Supabase RPCs with `base_updated_at` conflict checks.
6. Success updates local cache; failure becomes `failed` or `conflict` and is visible at `/settings/sync`.

Some online-only actions still call Supabase directly, for example ledger create/join/delete/leave and transfer confirmations.

## Navigation Shape

Root stack:

- `/` auth/ledger gate.
- `/auth` authentication screen.
- `/ledger` first-ledger create/join screen.
- `/(tabs)` authenticated main app.
- `/expenses/new` modal-style new expense screen.
- `/expenses/[id]` edit expense screen.
- `/settings/account`, `/settings/ledgers`, `/settings/recurring`, `/settings/sync` settings detail screens.

Main tabs:

- `/(tabs)` or `/(tabs)/index`: Dashboard.
- `/(tabs)/history`: History.
- `/(tabs)/settings`: Settings.

Full route inventory is in `docs/UI_ROUTES.md`.

## Data Model

Supabase public tables represented by `src/types/database.ts`:

- `profiles`: app profile row for each auth user.
- `ledgers`: shared ledger metadata and invite code.
- `ledger_members`: ledger membership join table.
- `ledger_categories`: older/custom category storage, still cached locally and supported by RPCs.
- `expenses`: expense rows, including category id/subcategory and recurring metadata.
- `expense_splits`: per-user split amounts.
- `recurring_expense_rules`: fixed monthly expense rules.
- `transfer_checklist_completions`: confirmation state for generated transfer checklist items.

Local SQLite mirrors the business tables and adds:

- `local_meta`: schema version and refresh markers.
- `sync_queue`: offline mutation queue.
- `sync_dedupe`: synced mutation dedupe.
- `transfer_checklist_snapshot`: cached transfer checklist RPC result.

## Realtime And Local Events

`LedgerProvider` subscribes to Supabase postgres changes for:

- `expenses`
- `expense_splits`
- `ledger_categories`
- `recurring_expense_rules`
- `transfer_checklist_completions`

Those subscriptions refresh local SQLite snapshots and/or emit in-process ledger events. Screens and hooks subscribe through `subscribeToLedgerData(ledgerId, listener)`.

## Key Constraints

- Currency is JPY only; amounts are integers.
- Ledgers are designed for up to two members. Database RPCs enforce the key membership behavior.
- Expense deletes are hard deletes remotely; local deletes are queued as tombstone-like pending changes until synced.
- `recorded_by` is owned by the database/app insert path and should not be changed during edits.
- `category_id` is the current canonical category field; `category` remains for legacy labels.
- Fixed expenses use `Asia/Tokyo` by default in the UI.
- Offline write support exists for expenses and recurring rules; ledger management requires network.
