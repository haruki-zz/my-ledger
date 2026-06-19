# UI Routes

本文档是当前 App 可用/可达 UI 的权威清单。路由来自 `app/` 文件结构和 `app/_layout.tsx`、`app/(tabs)/_layout.tsx`。

## Route Map

| UI | Path | Route file | Reachability | Main purpose |
| --- | --- | --- | --- | --- |
| App gate | `/` | `app/index.tsx` | App launch/default route | 检查 Supabase 配置、session、active ledger，并重定向 |
| Auth | `/auth` | `app/auth.tsx` | 未登录时自动到达；也可直接访问 | Sign in / Sign up |
| First ledger | `/ledger` | `app/ledger.tsx` | 登录后无 active ledger 时自动到达 | 创建或加入第一个账本 |
| Main tabs | `/(tabs)` | `app/(tabs)/index.tsx` | 登录且有 active ledger 后从 `/` 到达 | 默认 Dashboard |
| Dashboard | `/(tabs)/index` | `app/(tabs)/index.tsx` | Tab 1 | 周期总额、成员分摊、转账清单、分类占比、daily trend |
| History | `/(tabs)/history` | `app/(tabs)/history.tsx` | Tab 2 | 支出历史、筛选、按日折叠、详情/拆分弹窗 |
| Settings | `/(tabs)/settings` | `app/(tabs)/settings.tsx` | Tab 3 | 账户、账本、固定支出、同步状态入口 |
| New expense | `/expenses/new` | `app/expenses/new.tsx` | Floating `+` button；modal presentation | 新增支出 |
| Edit expense | `/expenses/[id]` | `app/expenses/[id].tsx` | History row tap/swipe/context menu | 编辑指定支出 |
| Ledger management | `/settings/ledgers` | `app/settings/ledgers.tsx` | Settings ledgers panel | 创建、加入、切换、删除或退出账本 |
| Fixed expense | `/settings/recurring` | `app/settings/recurring.tsx` | Settings Fixed Expense panel | 新建固定支出规则 |
| Edit fixed expense | `/settings/recurring?ruleId=<id>` | `app/settings/recurring.tsx` | Settings fixed expense rule row | 编辑/删除指定固定支出规则 |
| Sync status | `/settings/sync` | `app/settings/sync.tsx` | Settings sync row；conflict banner | 查看和处理离线同步队列 |

## Redirect Rules

`/` does the following:

1. If Supabase env vars are missing, render a configuration error.
2. If auth or ledger state is still loading, render a loading state.
3. If no session, redirect to `/auth`.
4. If signed in but no active ledger, redirect to `/ledger`.
5. If signed in and active ledger exists, redirect to `/(tabs)`.

`/auth` redirects back to `/` when a session already exists.

`/ledger` redirects to `/(tabs)` after create/join or when an active ledger already exists.

Guarded detail pages redirect to:

- `/auth` when there is no current user.
- `/ledger` when there is no active ledger.

## Navigation Entry Points

| Entry point | Destination |
| --- | --- |
| Mobile/wide tab Dashboard item | `/(tabs)/index` |
| Mobile/wide tab History item | `/(tabs)/history` |
| Mobile/wide tab Settings item | `/(tabs)/settings` |
| Draggable floating `+` button | `/expenses/new` |
| History expense row tap | `/expenses/[id]` |
| History swipe right | `/expenses/[id]` |
| History long-press menu "Edit" | `/expenses/[id]` |
| Settings Manage ledgers row | `/settings/ledgers` |
| Settings Add fixed expense row | `/settings/recurring` |
| Settings fixed expense rule row | `/settings/recurring?ruleId=<id>` |
| Settings Sync Status row | `/settings/sync` |
| Sync conflict banner | `/settings/sync` |

## UI Available On Each Screen

### `/auth`

- Sign In / Sign Up segmented tabs.
- Sign up display name input.
- Email/password inputs.
- Submit button.

### `/ledger`

- Create ledger form.
- Join ledger by invite code form.
- Pull-to-refresh ledger membership.

### `/(tabs)/index`

- Month navigation with chevrons and horizontal swipe.
- Period selector: Today / Week / Month.
- Total amount and comparison.
- Current/other member split totals.
- Transfer checklist summary and overlay.
- Category share pie chart.
- Daily trend chart with user legend.
- Floating add expense button from tab layout.

### `/(tabs)/history`

- Month navigation with chevrons and horizontal swipe.
- Filtered total.
- User filter.
- Category multiselect filter.
- Day-section collapse/expand.
- Expense rows with tap, swipe, long-press context menu, and accessibility actions.
- Expense detail modal.
- Split breakdown modal.
- Empty states and clear filters.

### `/(tabs)/settings`

- Account card with inline display name editing and sign out.
- Active ledger panel with invite code sharing and quick switch rows.
- Fixed Expense panel with active/paused counts, expandable rules, rule toggles.
- Sync Status row showing pending/failed/conflict counts.

### `/expenses/new` and `/expenses/[id]`

Both render `ExpenseForm`:

- Amount input.
- Category and subcategory selection.
- Paid by / belongs to member selection.
- Personal/shared ownership.
- Shared split amount controls.
- Date and note inputs.
- Save action; edit page loads existing expense.

### `/settings/ledgers`

- Current ledger card.
- Other ledger cards.
- Member preview.
- Invite code display.
- Switch action for non-active ledgers.
- Delete ledger for owner; leave ledger for non-owner.
- Create ledger form.
- Join ledger form.

### `/settings/recurring`

- Rule name.
- Amount.
- Category and subcategory presets.
- Generate day selector.
- Start/end month fields.
- Personal/shared ownership.
- Payer/member split amount controls.
- Active toggle.
- Save rule.
- Delete fixed expense when editing an existing `ruleId`.

### `/settings/sync`

- Online/offline and queue summary.
- Local database unavailable state and retry.
- Queue item list.
- Retry.
- Use Local for conflicts.
- Discard local change.

## Routes That Do Not Exist

These older routes are not present in current code:

- `/settings/categories`
- `/settings/ledger/[id]`
- Any standalone category trend modal route

Category management is currently represented by the fixed category system in `src/lib/categorySystem.ts` and legacy category database support, not by a reachable settings screen.
