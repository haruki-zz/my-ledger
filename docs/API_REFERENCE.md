# API Reference

本文档列出现有 App 内部 API、Supabase RPC/table API、本地同步 API。组件库见 `docs/COMPONENTS.md`。

## App-Facing Data API

Use `src/lib/ledger.ts` from screens/hooks. It hides local-cache fallback, remote reads, and RPC details.

| Export | Purpose | Storage/network behavior |
| --- | --- | --- |
| `updateMyProfile(displayName)` | Update current user's profile display name. | Direct Supabase `profiles` update |
| `getMyLedgerMemberships(currentUserId?)` | Load ledgers joined by current user. | Local first, remote fallback |
| `createLedger(name)` | Create ledger through RPC. | Online RPC |
| `joinLedger(inviteCode)` | Join ledger by invite code. | Online RPC |
| `leaveLedger(ledgerId)` | Leave ledger. | Online RPC |
| `deleteLedger(ledgerId)` | Owner delete ledger. | Online RPC |
| `getLedgerMembers(ledgerId)` | Load ledger members with profiles. | Local first, remote fallback |
| `getRecurringExpenseRules(ledgerId, options?)` | Load fixed expense rules. | Local first, optional refresh, remote fallback |
| `saveRecurringExpenseRule(input)` | Create/update fixed expense rule. | Local write + queue; remote fallback if SQLite unavailable |
| `deleteRecurringExpenseRule(ledgerId, ruleId)` | Delete fixed expense rule. | Local write + queue; online-only fallback if SQLite unavailable |
| `generateRecurringExpenses(ledgerId, untilMonth?)` | Generate recurring expenses through current month/date. | Online RPC; returns empty offline |
| `deleteRecurringGeneratedExpense(ledgerId, ruleId)` | Delete current generated expense for a rule. | Local if cached, otherwise online RPC |
| `getProfiles(userIds)` | Load profile map by user id. | Local first, remote fallback |
| `getExpenses(ledgerId)` | Load all expenses for ledger. | Local first, remote fallback |
| `getExpensesByMonth(ledgerId, startDate, endDate, options?)` | Load expenses in date range. | Local first, optional refresh, remote fallback |
| `getFirstExpenseSpentOn(ledgerId)` | Earliest expense date for month navigation lower bound. | Local first, remote fallback |
| `getExpense(expenseId)` | Load one expense with splits. | Local first, remote fallback |
| `saveExpense(input)` | Create/update expense. | Local write + queue |
| `deleteExpense(expenseId)` | Delete expense. | Local write + queue |
| `getOpenTransferItems(ledgerId)` | Load open transfer checklist rows. | Cached snapshot + online RPC refresh |
| `setTransferConfirmations(updates)` | Confirm/unconfirm transfer items. | Online RPC only |
| `getErrorMessage(error)` | Normalize thrown values to displayable strings. | Pure helper |

Important input types:

- `SaveExpenseInput`
- `SaveRecurringExpenseRuleInput`
- `TransferConfirmationUpdate`
- `LedgerMembership`
- `GenerateRecurringExpenseResult`

## Context APIs

| Hook | Source | Returns |
| --- | --- | --- |
| `useAuth()` | `src/context/AuthContext.tsx` | `session`, `loading`, `signOut()` |
| `useLedgerContext()` | `src/context/LedgerContext.tsx` | `activeLedger`, `ledgers`, `loading`, `error`, `reloadLedgers`, `selectLedger`, `createAndSelect`, `joinAndSelect`, `leaveLedger`, `deleteLedger` |
| `useSyncContext()` | `src/context/SyncContext.tsx` | `online`, queue counts, `refresh`, `requestDrain`, `hasUnsyncedChanges` |

## Hook APIs

| Hook | Source | Purpose |
| --- | --- | --- |
| `useDashboardData(monthKey, period)` | `src/hooks/useDashboardData.ts` | Loads dashboard ledger/members/expenses/rules/profiles and returns derived `stats`. |
| `useTransferChecklist(ledgerId)` | `src/hooks/useTransferChecklist.ts` | Loads open transfer items and exposes `setConfirmations`. |
| `useHistoryFilters()` | `src/hooks/useHistoryFilters.ts` | Local state machine for History filters and dropdowns. |
| `useRequiredLedger()` | `src/hooks/useRequiredLedger.ts` | Guard for authenticated screens requiring an active ledger. |

## Supabase Tables

The typed schema is in `src/types/database.ts`.

| Table | Used for |
| --- | --- |
| `profiles` | User display names. |
| `ledgers` | Ledger name, invite code, owner, timestamps. |
| `ledger_members` | Membership rows and join dates. |
| `ledger_categories` | Legacy/custom category rows and split ratio defaults. |
| `expenses` | Expense records, canonical category id/subcategory, recurring metadata. |
| `expense_splits` | Per-user split amounts for shared expenses. |
| `recurring_expense_rules` | Fixed monthly expense rules. |
| `transfer_checklist_completions` | Per-user transfer checklist completion state. |

## Supabase RPCs

Current RPC types are defined in `src/types/database.ts`.

| RPC | Called by | Purpose |
| --- | --- | --- |
| `create_ledger(p_name)` | `createLedger` | Create ledger and add creator as member. |
| `join_ledger_by_invite(p_invite_code)` | `joinLedger` | Join ledger by invite code. |
| `leave_ledger(p_ledger_id)` | `leaveLedger` | Remove current user membership. |
| `delete_ledger(p_ledger_id)` | `deleteLedger` | Delete owner-owned ledger. |
| `seed_default_categories(p_ledger_id)` | migrations/create ledger RPC | Seed default categories; not directly called by current UI. |
| `save_ledger_category(...)` | legacy support | Save category; not directly called by current UI. |
| `delete_ledger_category(...)` | legacy support | Delete category; not directly called by current UI. |
| `save_ledger_category_offline(...)` | `localRepository` queue drain | Sync queued category save. |
| `delete_ledger_category_offline(...)` | `localRepository` queue drain | Sync queued category delete. |
| `save_expense(...)` | legacy support | Original direct save expense RPC; current writes use offline RPC path. |
| `save_expense_offline(...)` | `localRepository` queue drain | Sync queued create/edit expense with conflict check. |
| `delete_expense(...)` | legacy support | Original delete RPC. |
| `delete_expense_offline(...)` | `localRepository`, `deleteRecurringGeneratedExpense` | Sync queued delete or delete generated recurring expense with conflict check. |
| `save_recurring_expense_rule_offline(...)` | `saveRecurringExpenseRule`, queue drain | Save recurring rule with conflict check. |
| `delete_recurring_expense_rule_offline(...)` | `deleteRecurringExpenseRule`, queue drain | Delete recurring rule with conflict check. |
| `generate_recurring_expenses(p_ledger_id, p_until_month)` | dashboard/history/settings/ledger activation | Generate missing fixed expenses. |
| `get_open_transfer_items(p_ledger_id)` | `getOpenTransferItems` | Compute unsettled transfer items. |
| `set_transfer_confirmations(p_updates)` | `setTransferConfirmations` | Update transfer completion rows. |

## Local Repository API

Use these only when working on offline sync internals. Screens should prefer `src/lib/ledger.ts`.

| Export | Purpose |
| --- | --- |
| `setSyncDrainRequester`, `setLocalRepositoryOnline`, `setLocalRepositoryUserId`, `isLocalRepositoryOnline` | Wire repository state to providers. |
| `getSyncQueueSummary`, `getSyncQueueItems` | Read sync queue status. |
| `retrySyncQueueItem`, `forceLocalSyncQueueItem`, `discardLocalSyncQueueItem` | Sync Status actions. |
| `getCached*` functions | Read local snapshots. |
| `refresh*` functions | Fetch remote data and update local snapshots. |
| `saveLocalExpense`, `deleteLocalExpense` | Local expense writes and queue enqueue. |
| `saveLocalRecurringRule`, `deleteLocalRecurringRule` | Local recurring-rule writes and queue enqueue. |
| `cacheTransferItems` | Store transfer checklist snapshot. |
| `drainSyncQueue` | Push queued mutations to Supabase. |

## Local Database API

From `src/lib/localDb.ts`:

| Export | Purpose |
| --- | --- |
| `getLocalDb()` | Open/migrate SQLite database. |
| `retryLocalDbOpen()` | Reset unavailable state and reopen database. |
| `withLocalTransaction(fn)` | Serialize SQLite transactions. |
| `clearLocalBusinessData()` | Clear business tables on sign out. |
| `isLocalDbUnavailableError(error)` | Detect local database capability failure. |

Local schema version: `5`.

## Pure Helper APIs

| Source | Useful exports |
| --- | --- |
| `src/lib/stats.ts` | `currentMonthKey`, `addMonths`, `formatMonthLabel`, `resolveDashboardDateRange`, `buildDashboardPeriodStats`, `amountForUser`, `expenseCategoryId` |
| `src/lib/recurring.ts` | `monthKeyToStartDate`, `dateStringToMonthKey`, `currentMonthStartDate`, `isValidMonthKey`, `generatedSpentOnDate`, `activeRecurringSubcategoryKeys` |
| `src/lib/categorySystem.ts` | `PRIMARY_CATEGORIES`, `categoryLabel`, `categoryIconName`, `categoryColor`, `subcategoryPresets`, `resolveCategory`, `mapLegacyCategoryToId` |
| `src/lib/format.ts` | `formatYen`, `formatCompactYen`, `todayDateString`, `displayName` |
| `src/lib/entityColors.ts` | `buildUserColorMap`, `colorForCategory` |
| `src/lib/color.ts` | `tintFromAccent` |
| `src/lib/keyboard.ts` | `runAfterKeyboardDismiss` |
| `src/lib/math.ts` | `clampToRange` |

## Existing Tests

| Test file | Covers |
| --- | --- |
| `src/lib/stats.test.ts` | Dashboard/stat helper behavior. |
| `src/lib/recurring.test.ts` | Recurring date/key helper behavior. |
| `src/lib/syncQueue.test.ts` | Queue merge and retry classification behavior. |
