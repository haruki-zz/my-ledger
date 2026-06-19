# File Structure

本文档说明当前仓库文件的作用，以及它们依赖的本地文件/模块。第三方库清单见 `docs/COMPONENTS.md`。

## Root Files

| Path | Role | Local dependencies |
| --- | --- | --- |
| `README.md` | 项目入口、运行方式、文档索引。 | `docs/*` |
| `package.json` | npm scripts、运行时依赖、开发依赖。 | `scripts/fix-supabase.cjs` via `postinstall` |
| `package-lock.json` | npm lockfile。 | `package.json` |
| `app.json` | Expo app 配置、图标、splash、web bundler、JSC 引擎配置。 | `assets/*` |
| `tsconfig.json` | TypeScript/Expo 配置，定义 `@/*` 指向仓库根。 | none |
| `eslint.config.js` | Expo ESLint 配置。 | none |
| `knip.json` | Knip unused-code 配置。 | project source |
| `knip.routes.json` | Expo Router 路由相关 Knip 配置。 | `app/*` |
| `.env.example` | Supabase URL/anon key 示例。 | none |
| `.gitignore` | Git 忽略规则。 | none |

## `app/` Routes

| Path | Role | Local dependencies |
| --- | --- | --- |
| `app/_layout.tsx` | Root Stack；加载 JetBrains Mono；挂载 `AuthProvider`、`SyncProvider`、`LedgerProvider`；配置 header/back 行为。 | `src/components/styles`, `src/context/AuthContext`, `src/context/SyncContext`, `src/context/LedgerContext` |
| `app/index.tsx` | Auth/ledger gate；根据 Supabase 配置、session、active ledger 跳转到 `/auth`、`/ledger` 或 `/(tabs)`。 | `styles`, `AuthContext`, `LedgerContext`, `supabase` |
| `app/auth.tsx` | 登录/注册表单；直接调用 Supabase Auth。 | keyboard helpers, `styles`, `ui`, `AuthContext`, `keyboard`, `supabase` |
| `app/ledger.tsx` | 首次进入时创建或加入账本。 | keyboard helpers, `styles`, `ui`, `LedgerContext`, `keyboard`, `ledger` APIs |
| `app/(tabs)/_layout.tsx` | Tab shell；移动端底部 tab、宽屏 sidebar、可拖拽新增按钮。 | `src/components/layout`, `src/components/styles` |
| `app/(tabs)/index.tsx` | Dashboard：周期总额、成员分摊、转账清单、分类占比、每日趋势。 | charts, transfer components, `ui`, `useDashboardData`, `useTransferChecklist`, formatting/stats/color helpers |
| `app/(tabs)/history.tsx` | History：月份导航、成员/分类筛选、日分组列表、支出详情/拆分弹窗、编辑/删除。 | history components, `ui`, auth/ledger contexts, `useHistoryFilters`, category/entity/format/ledger/localEvents/recurring/stats helpers |
| `app/(tabs)/settings.tsx` | Settings hub：账户、当前账本、固定支出摘要、同步状态入口、退出登录。 | `ui`, auth/ledger/sync contexts, `useRequiredLedger`, category/color/format/ledger helpers |
| `app/expenses/new.tsx` | 新增支出页面；加载账本、成员、固定支出规则、profiles 后渲染 `ExpenseForm`。 | `ExpenseForm`, `styles`, auth/ledger contexts, `ledger` APIs, database types |
| `app/expenses/[id].tsx` | 编辑支出页面；校验 expense 属于当前账本后渲染 `ExpenseForm`。 | `ExpenseForm`, `styles`, auth/ledger contexts, `ledger` APIs, database types |
| `app/settings/account.tsx` | 账户设置：展示邮箱、更新 display name、退出登录、跳到账本管理。 | keyboard helpers, `styles`, `ui`, auth/sync contexts, `useRequiredLedger`, `keyboard`, `ledger` APIs |
| `app/settings/ledgers.tsx` | 账本管理：当前/其他账本、成员预览、创建、加入、切换、删除或退出。 | keyboard helpers, `styles`, auth/ledger contexts, `color`, `format`, `keyboard`, `ledger` APIs, database types |
| `app/settings/recurring.tsx` | Fixed Expense 编辑器；新建/编辑/删除每月固定支出规则，生成当月支出。 | keyboard helpers, `styles`, `ui`, `useRequiredLedger`, category/color/format/keyboard/ledger/localEvents/recurring helpers, database types |
| `app/settings/sync.tsx` | Sync Status：展示本地同步队列、retry/use local/discard、SQLite retry。 | `styles`, `ui`, `SyncContext`, `localDb`, `localRepository`, `syncQueue` types |

## `src/context/`

| Path | Role | Local dependencies |
| --- | --- | --- |
| `src/context/AuthContext.tsx` | Supabase session provider；监听 auth state；sign out 时清空本地业务缓存。 | `localDb`, `localRepository`, `supabase` |
| `src/context/LedgerContext.tsx` | Active ledger provider；使用 AsyncStorage 保存当前账本；刷新 ledger 本地缓存；设置 Supabase realtime subscriptions。 | `AuthContext`, `ledger`, `localDb`, `localEvents`, `localRepository`, `recurring`, `supabase` |
| `src/context/SyncContext.tsx` | 网络状态和同步队列 provider；冲突 banner；online 时触发队列 drain。 | `styles`, `localDb`, `localEvents`, `localRepository` |

## `src/hooks/`

| Path | Role | Local dependencies |
| --- | --- | --- |
| `src/hooks/useDashboardData.ts` | Dashboard 数据加载、固定支出生成、realtime/local event reload、统计派生。 | auth/ledger contexts, `ledger`, `localEvents`, `stats`, database types |
| `src/hooks/useHistoryFilters.ts` | History 筛选状态：用户、分类、月份、dropdown。 | `stats` |
| `src/hooks/useRequiredLedger.ts` | 页面守卫；未登录跳 `/auth`，无账本跳 `/ledger`。 | auth/ledger contexts, database types |
| `src/hooks/useTransferChecklist.ts` | 转账清单数据加载、保存确认状态、事件 reload debounce。 | `ledger`, `localEvents`, database types |

## `src/components/`

| Path | Role | Local dependencies |
| --- | --- | --- |
| `src/components/styles.ts` | 颜色、字体、主题、共享样式。 | `layout`, `chartPalette` |
| `src/components/layout.ts` | 浮动 tab、sidebar、断点、内容底部 padding 常量。 | none |
| `src/components/ui.tsx` | 共享 UI primitives：`BentoCard`, `PillTabs`, `IconButton`, `ToggleSwitch`, `SwipeExpenseRow`。 | `ExpenseContextMenu`, `ExpenseRowCardContent`, `styles` |
| `src/components/ExpenseForm.tsx` | 支出新增/编辑表单；分类、金额、成员、拆分、日期、保存逻辑。 | keyboard helpers, `styles`, `ui`, category/entity/format/keyboard/ledger/recurring helpers, database types |
| `src/components/ExpenseRowCardContent.tsx` | 支出行卡片内容布局。 | `styles`, `color` |
| `src/components/ExpenseContextMenu.tsx` | 支出行长按上下文菜单。 | `ExpenseRowCardContent`, `styles`, `math` |
| `src/components/DailyChart.tsx` | Dashboard daily chart。 | `styles`, `format`, `stats` |
| `src/components/PieChart.tsx` | Dashboard category pie/donut chart。 | `styles`, `categories`, `format`, `stats` |
| `src/components/SlidingValueText.tsx` | 数值变化时的 animated text。 | none |
| `src/components/KeyboardAwareScrollView.tsx` | ScrollView keyboard wrapper，附带 keyboard done accessory。 | `KeyboardDoneAccessory` |
| `src/components/KeyboardDoneAccessory.tsx` | iOS `InputAccessoryView` Done 和 Android fixed Done button。 | `styles` |
| `src/components/TransferChecklistCard.tsx` | Dashboard 内嵌转账清单卡片。 | transfer shared/overlay components, `styles`, `ui`, color/entity/format/ledger helpers, database types |
| `src/components/TransferChecklistShared.tsx` | 转账清单卡片复用展示、参与者判断、完成时间判断。 | `styles`, category/color/entity/format helpers, database types |
| `src/components/TransferItemsOverlay.tsx` | 转账清单全量 overlay。 | `TransferChecklistShared`, `styles`, `ui`, database types |
| `src/components/history/HistoryFilterControls.tsx` | History filter buttons/options/category multiselect。 | `styles` |
| `src/components/history/HistoryExpenseModals.tsx` | History expense detail and split breakdown modals。 | `styles`, `ui`, category/format helpers, database types |

## `src/lib/`

| Path | Role | Local dependencies |
| --- | --- | --- |
| `src/lib/supabase.ts` | Supabase client 初始化；读取 `EXPO_PUBLIC_SUPABASE_URL` 和 anon key；AsyncStorage session storage。 | none |
| `src/lib/ledger.ts` | App-facing data API；封装 profile/ledger/expense/recurring/transfer reads and writes；本地优先、必要时远程 fallback。 | `localDb`, `localRepository`, `recurring`, `supabase`, database types |
| `src/lib/localRepository.ts` | SQLite repository、缓存刷新、离线写入、sync queue drain、Supabase RPC sync。 | `categorySystem`, `localDb`, `localEvents`, `supabase`, `syncQueue`, database types |
| `src/lib/localDb.ts` | SQLite open/migrate/transaction/clear；local schema version 5。 | none |
| `src/lib/localEvents.ts` | 进程内 ledger data changed pub/sub。 | none |
| `src/lib/syncQueue.ts` | Queue merge、错误分类、重试状态计算。 | none |
| `src/lib/stats.ts` | Dashboard/History 统计、日期范围、月份工具、按用户金额、分类 id 解析。 | `categorySystem`, `entityColors`, database types |
| `src/lib/recurring.ts` | Fixed expense 日期/月 key 工具、active recurring subcategory key 计算。 | database types |
| `src/lib/categorySystem.ts` | Canonical primary categories、icons、颜色、subcategory presets、legacy category mapping。 | none |
| `src/lib/categories.ts` | Legacy `EXPENSE_CATEGORIES` compatibility wrapper。 | `categorySystem` |
| `src/lib/entityColors.ts` | 分类和成员颜色映射。 | `categorySystem`, `chartPalette` |
| `src/lib/chartPalette.ts` | Chart color list。 | none |
| `src/lib/color.ts` | `tintFromAccent` helper。 | `styles` |
| `src/lib/format.ts` | JPY、compact JPY、today date string、display name formatting。 | none |
| `src/lib/keyboard.ts` | Keyboard dismiss 后执行 action 的 helper。 | none |
| `src/lib/math.ts` | Numeric clamp helper。 | none |
| `src/lib/*.test.ts` | Vitest tests for stats, recurring, sync queue。 | matching lib modules |

## `src/types/`

| Path | Role | Local dependencies |
| --- | --- | --- |
| `src/types/database.ts` | 手写 Supabase schema 类型、table row 类型、RPC 类型、组合类型。 | none |

## `scripts/`

| Path | Role | Local dependencies |
| --- | --- | --- |
| `scripts/fix-supabase.cjs` | `postinstall` workaround：patch Supabase OTEL dynamic import issue。 | `node_modules/@supabase/*` |

## `supabase/`

| Path | Role | Local dependencies |
| --- | --- | --- |
| `supabase/config.toml` | Supabase CLI local project config。 | migrations |
| `supabase/migrations/20260523000000_initial_ledger_schema.sql` | 初始 schema：profiles, ledgers, members, expenses, splits, auth trigger, base RPCs/RLS。 | none |
| `supabase/migrations/20260523100000_ledger_categories.sql` | Ledger categories table and category RPCs。 | initial schema |
| `supabase/migrations/20260526111054_ledger_management.sql` | Leave/delete ledger RPCs and cascade behavior。 | prior schema |
| `supabase/migrations/20260528073153_english_defaults.sql` | English defaults for profiles/categories and create/join RPC updates。 | prior schema |
| `supabase/migrations/20260601123544_transfer_checklist.sql` | Transfer checklist table/RPCs and save expense updates。 | prior schema |
| `supabase/migrations/20260603002936_offline_sync.sql` | Offline sync RPCs with `base_updated_at` conflict checks。 | prior schema |
| `supabase/migrations/20260607030604_category_id_subcategory_phase1.sql` | Adds canonical category id/subcategory and updates relevant RPCs。 | prior schema |
| `supabase/migrations/20260607080543_fix_transfer_direction.sql` | Fixes transfer checklist direction logic。 | transfer checklist RPC |
| `supabase/migrations/20260607034108_recurring_expense_rules.sql` | Recurring rules table and generation RPC。 | prior schema |
| `supabase/migrations/20260608000000_recurring_expense_rule_ownership.sql` | Adds ownership handling to recurring rules/generation。 | recurring rules |
| `supabase/migrations/20260613091606_recurring_rule_split_amounts.sql` | Adds fixed split amounts to recurring rules。 | recurring rules |
| `supabase/migrations/20260613092623_recurring_rule_rpc_grants.sql` | Refreshes recurring RPC grants。 | recurring RPC signatures |
| `supabase/migrations/20260617073301_delete_recurring_expense_rule.sql` | Adds recurring rule delete RPC。 | recurring rules |
| `supabase/migrations/20260618051850_fix_recurring_expense_generation_conflict_target.sql` | Fixes recurring generation conflict target。 | recurring generation RPC |

## `assets/`

| Path | Role | Local dependencies |
| --- | --- | --- |
| `assets/icon.*`, `assets/favicon.png`, `assets/splash-icon.png` | Expo app icon, favicon, splash assets。 | referenced by `app.json` |
| `assets/android-icon-*` | Android adaptive icon layers。 | referenced by `app.json` |
| `assets/png/*`, `assets/AppIcon.appiconset/*` | Platform/exported icon assets。 | packaging/manual asset workflows |
| `assets/README.md` | Asset notes。 | assets |
