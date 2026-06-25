# Components And Reuse Reference

本文档列出现有组件、hooks、第三方组件库，方便后续开发复用，避免重复实现。

## External Libraries

| Package | Current use |
| --- | --- |
| `expo-router` | File-based routing, Stack/Tabs, redirects, route params. |
| `react-native` | Core UI primitives, `Animated`, `PanResponder`, `Alert`, `Share`, `Modal`, lists. |
| `@expo/vector-icons` | Ionicons across nav, buttons, categories, rows. |
| `react-native-svg` | Custom charts. |
| `@expo-google-fonts/jetbrains-mono` | Font loading in root layout. |
| `@react-native-async-storage/async-storage` | Supabase session storage and active ledger id. |
| `expo-sqlite` | Local database and offline queue. |
| `@react-native-community/netinfo` | Online/offline detection. |
| `@supabase/supabase-js` | Auth, table reads/writes, realtime, RPC. |
| `react-native-safe-area-context` | Safe-area aware navigation and screens. |
| `@react-native-community/datetimepicker` | Available dependency for native date picking; current code mostly uses custom selectors/inputs. |
| `expo-blur`, `expo-constants`, `expo-linking`, `expo-font`, `expo-status-bar` | Expo runtime support and status bar/font behavior. |

## Shared UI Primitives

Source: `src/components/ui.tsx`.

| Component | Use it for | Notes |
| --- | --- | --- |
| `BentoCard` | Cards, form groups, chart containers, danger panels. | Variants: `default`, `hero`, `chart`, `list`, `form`, `danger`. |
| `PillTabs<T>` | Segmented controls. | Animated indicator; supports `sm` and `md`; typed string values. |
| `IconButton` | Icon-only buttons. | Sizes `sm/md/lg`; tones `primary/neutral/danger`; variants `glass/solid/ghost`. |
| `ToggleSwitch` | Boolean state UI. | Can be readonly if no `onPress`; accessible as switch when interactive. |
| `SwipeExpenseRow` | Expense list row actions. | Tap edit, swipe edit/delete, long-press context menu, accessibility actions. |

Prefer these before introducing a new card, segmented control, icon button, switch, or expense row implementation.

## Expense Components

| Component | Source | Reuse case |
| --- | --- | --- |
| `ExpenseForm` | `src/components/ExpenseForm.tsx` | Any create/edit expense flow. |
| `ExpenseRowCardContent` | `src/components/ExpenseRowCardContent.tsx` | Visual content inside expense row or context menu preview. |
| `ExpenseContextMenu` | `src/components/ExpenseContextMenu.tsx` | Long-press action menu around an expense card. |
| `HistoryExpenseModals` | `src/components/history/HistoryExpenseModals.tsx` | Expense detail and split breakdown modals. |
| `HistoryFilterControls` | `src/components/history/HistoryFilterControls.tsx` | User/category filter controls. |

## Dashboard And Chart Components

| Component | Source | Reuse case |
| --- | --- | --- |
| `DailyChart` | `src/components/DailyChart.tsx` | Member daily series chart. |
| `PieChart` | `src/components/PieChart.tsx` | Category breakdown. |
| `SlidingValueText` | `src/components/SlidingValueText.tsx` | Animated numeric text transitions. |
| `TransferSettleEntry` | `src/components/TransferSettleEntry.tsx` | Dashboard hero transfer entry and settle-up bottom sheet. |
| `TransferChecklistShared` exports | `src/components/TransferChecklistShared.tsx` | Shared transfer item card, participant/completion helpers. |

## Keyboard Components

| Component/helper | Source | Reuse case |
| --- | --- | --- |
| `KeyboardAwareScrollView` | `src/components/KeyboardAwareScrollView.tsx` | Form screens that should avoid keyboard overlap. |
| `KeyboardDoneAccessory` | `src/components/KeyboardDoneAccessory.tsx` | iOS Done accessory. |
| `AndroidKeyboardDoneButton` | `src/components/KeyboardDoneAccessory.tsx` | Android/web compatible Done affordance when needed. |
| `KEYBOARD_DONE_ACCESSORY_ID` | `src/components/KeyboardDoneAccessory.tsx` | Attach TextInput accessory. |
| `runAfterKeyboardDismiss` | `src/lib/keyboard.ts` | Dismiss keyboard before navigation/save actions. |

## Hooks To Reuse

| Hook | Use it for |
| --- | --- |
| `useRequiredLedger()` | Any screen that requires both user and active ledger. |
| `useDashboardData(monthKey, period)` | Any dashboard-like surface that needs expense stats. |
| `useTransferChecklist(ledgerId)` | Any transfer checklist view. |
| `useHistoryFilters()` | History-style filter state. |
| `useAuth()` | Session and sign out. |
| `useLedgerContext()` | Active ledger and ledger actions. |
| `useSyncContext()` | Sync summary and online status. |

## Category System

Source: `src/lib/categorySystem.ts`.

Use these instead of hard-coded category labels/icons/colors:

- `PRIMARY_CATEGORIES`
- `DEFAULT_CATEGORY_SPLIT_RATIO`
- `isPrimaryCategoryId`
- `getPrimaryCategory`
- `categoryLabel`
- `categoryIconName`
- `categoryColor`
- `subcategoryPresets`
- `resolveCategory`
- `mapLegacyCategoryToId`
- `categoryWithSubcategory`

Current primary category ids:

```text
housing
food_dining
household
transport
utilities
communications
healthcare
entertainment
shopping
travel
other
```

## Formatting And Color Helpers

| Helper | Source | Use |
| --- | --- | --- |
| `formatYen` | `src/lib/format.ts` | Full JPY amount. |
| `formatCompactYen` | `src/lib/format.ts` | Compact JPY labels. |
| `displayName` | `src/lib/format.ts` | User display fallback. |
| `todayDateString` | `src/lib/format.ts` | Local `YYYY-MM-DD` today string. |
| `buildUserColorMap` | `src/lib/entityColors.ts` | Stable member colors, current user first. |
| `colorForCategory` | `src/lib/entityColors.ts` | Category color fallback. |
| `tintFromAccent` | `src/lib/color.ts` | Transparent tint from solid accent. |

## Statistics Helpers

Source: `src/lib/stats.ts`.

Use these for any new Dashboard/History calculation:

- `currentMonthKey`
- `monthKeyFromDateString`
- `compareMonthKeys`
- `addMonths`
- `formatMonthLabel`
- `monthStartDateString`
- `resolveDashboardDateRange`
- `buildDashboardPeriodStats`
- `buildDashboardDailyUserSeriesForCategories`
- `amountForUser`
- `expenseCategoryId`
- `filterCurrentMonthSettledExpenses`

## Recurring Helpers

Source: `src/lib/recurring.ts`.

- `monthKeyToStartDate`
- `dateStringToMonthKey`
- `currentMonthStartDate`
- `isValidMonthKey`
- `generatedSpentOnDate`
- `recurringRuleSubcategoryKey`
- `activeRecurringSubcategoryKeys`

## Local Events

Source: `src/lib/localEvents.ts`.

Use `subscribeToLedgerData(ledgerId, listener)` and `emitLedgerDataChanged(ledgerId?)` for in-process refresh after local writes/cache refreshes. This is not a replacement for Supabase realtime; it bridges local repository writes to mounted screens.

## Patterns To Follow

- Route screens should stay thin when possible and delegate data loading to hooks/API wrappers.
- New business-data reads should usually be added to `src/lib/ledger.ts`, not called directly from screens.
- New offline-capable writes require local SQLite mutation, sync queue payload, remote RPC, and conflict handling in `localRepository`.
- New visual controls should first check `ui.tsx`, `styles.ts`, and the existing screen-local patterns.
