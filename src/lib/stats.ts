import { buildUserColorMap, DEFAULT_USER_COLOR, OTHER_CATEGORY_COLOR } from './entityColors';
import {
  categoryColor,
  categoryIconName,
  categoryLabel,
  getPrimaryCategory,
  PRIMARY_CATEGORIES,
  resolveCategory,
  type CategoryIconName,
  type PrimaryCategoryId
} from './categorySystem';
import { DEFAULT_LEDGER_TIME_ZONE, displayName, todayDateString } from './format';
import type { Expense, LedgerMemberProfile, RecurringExpenseRule } from '../types/database';

export type DashboardPeriod = 'today' | 'week' | 'month';

export type CategoryStat = {
  category: string;
  amountYen: number;
  budgetedSpendYen?: number;
  budgetStatus?: BudgetStatus;
  budgetUsedPercent?: number;
  budgetYen?: number;
  percentage: number;
  color: string;
  detailKey: string;
  hasBudget?: boolean;
  remainingBudgetYen?: number;
  sourceCategories?: string[];
  unbudgetedSpendYen?: number;
};

export type BudgetStatus = 'under' | 'near' | 'over';

export type DashboardCategoryBudget = {
  amountYen: number;
  categoryId: string | null;
};

type DailyStat = {
  date: string;
  label: string;
  amountYen: number;
};

export type DailyUserStat = {
  date: string;
  label: string;
  amountsByUserId: Record<string, number>;
  totalAmountYen: number;
};

export type HeatDay = {
  date: string;
  amount: number;
  count: number;
  byCategory: { id: string; label: string; color: string; amount: number }[];
  byMember: { id: string; label: string; color: string; amount: number }[];
};

type MemberPeriodStat = {
  userId: string;
  amountYen: number;
  percentage: number;
  color: string;
};

type ComparisonStat = {
  previousTotalYen: number;
  deltaYen: number;
  percentage: number | null;
  direction: 'under' | 'over' | 'same';
  label: string;
};

export type AmountComparisonDirection = 'new' | 'over' | 'same' | 'under';

export type AmountComparisonStat = {
  deltaYen: number;
  direction: AmountComparisonDirection;
  label: string;
  percentage: number | null;
  previousAmountYen: number;
};

export type CategoryDetailBreakdownKind = 'category' | 'subcategory';

export type CategoryDetailBreakdownItem = {
  amountYen: number;
  color: string;
  icon: CategoryIconName;
  key: string;
  label: string;
  percentage: number;
};

export type CategoryDetailDailyStat = {
  amountYen: number;
  date: string;
  isPeak: boolean;
  label: string;
};

export type CategoryDetailMemberSplit = {
  amountYen: number;
  color: string;
  percentage: number;
  userId: string;
};

export type CategoryDetailStat = {
  amountYen: number;
  averagePerDayYen: number;
  breakdown: CategoryDetailBreakdownItem[];
  breakdownKind: CategoryDetailBreakdownKind;
  budgetStatus?: BudgetStatus;
  budgetUsedPercent?: number;
  budgetYen?: number;
  category: string;
  color: string;
  comparison: AmountComparisonStat;
  daily: CategoryDetailDailyStat[];
  detailKey: string;
  hasBudget?: boolean;
  icon: CategoryIconName;
  memberSplits: CategoryDetailMemberSplit[];
  remainingBudgetYen?: number;
  shareOfTotal: number;
  sourceCategories: string[];
  topDay: {
    amountYen: number;
    date: string | null;
    label: string;
  };
  transactions: number;
};

export type DashboardPeriodNavigation = {
  canGoNext: boolean;
  canGoPrevious: boolean;
  label: string;
};

export type HistoryCategoryMixSegment = {
  amountYen: number;
  categoryId: PrimaryCategoryId;
  color: string;
  label: string;
  percentage: number;
};

export type HistorySummaryStat = {
  activeFilterCount: number;
  averagePerDayYen: number;
  categoryMix: HistoryCategoryMixSegment[];
  count: number;
  dateSpanLabel: string;
  peakDay: {
    amountYen: number;
    date: string | null;
    label: string;
  };
  topCategoryCaption: string;
  totalYen: number;
};

export type ReceiptMomDirection = 'down' | 'flat' | 'new' | 'up';

export type ReceiptCategoryLine = {
  amountYen: number;
  categoryId: PrimaryCategoryId;
  color: string;
  label: string;
  momDirection: ReceiptMomDirection;
  momLabel: string;
  previousAmountYen: number;
};

export type MonthlyReceiptStat = {
  activeCategoryCount: number;
  alexAmountYen: number;
  alexPercentage: number;
  categoryAmounts: Record<PrimaryCategoryId, number>;
  code: string;
  comparison: {
    direction: 'over' | 'under' | 'same';
    label: string;
    percentage: number | null;
    previousTotalYen: number;
  };
  dailyAverageYen: number;
  days: number;
  label: string;
  lines: ReceiptCategoryLine[];
  minaAmountYen: number;
  minaPercentage: number;
  monthKey: string;
  previousMonthKey: string;
  records: number;
  span: string;
  totalYen: number;
};

export type DashboardDateRange = {
  period: DashboardPeriod;
  effectiveMonthKey: string;
  startDateString: string;
  endDateString: string;
  comparisonStartDateString: string;
  comparisonEndDateString: string;
  label: string;
  comparisonLabel: string;
};

type DashboardStats = {
  totalYen: number;
  count: number;
  categories: CategoryStat[];
  dailySeries: DailyStat[];
};

export type DashboardPeriodStats = DashboardStats & {
  budgetedCategoryIds: string[];
  budgetedVariableTotalYen: number;
  categoryDetails: CategoryDetailStat[];
  dailyUserSeries: DailyUserStat[];
  comparison: ComparisonStat;
  dateRange: DashboardDateRange;
  fixedCategories: CategoryStat[];
  fixedTotalYen: number;
  getCategoryDetail: (detailKey: string | null | undefined) => CategoryDetailStat | null;
  memberTotals: MemberPeriodStat[];
  unbudgetedVariableTotalYen: number;
  variableTotalYen: number;
};

export type DashboardBudgetSummary = {
  budgetYen: number;
  budgetedSpendYen: number;
  dailyAllowanceYen: number | null;
  daysRemaining: number;
  fixedYen: number;
  hasBudget: boolean;
  monthDays: number;
  paceRatio: number;
  remainingYen: number;
  unbudgetedVariableYen: number;
  usedPercent: number;
  usedRatio: number;
  variableYen: number;
};

const DASHBOARD_CATEGORY_LIMIT = 6;
const DASHBOARD_OTHER_CATEGORY_COLOR = OTHER_CATEGORY_COLOR;

const monthFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  year: 'numeric'
});
const shortMonthFormatter = new Intl.DateTimeFormat('en', {
  month: 'short'
});
const dayFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short'
});
const longDayFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  weekday: 'short'
});
const receiptMonthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric'
});
function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function toMonthKey(date: Date) {
  return [date.getFullYear(), padDatePart(date.getMonth() + 1)].join('-');
}

export function currentMonthKey() {
  return toMonthKey(new Date());
}

export function monthKeyFromDateString(dateString: string) {
  return dateString.slice(0, 7);
}

export function filterCurrentMonthSettledExpenses(input: {
  expenses: Expense[];
  recurringRules: Pick<RecurringExpenseRule, 'id' | 'is_active'>[];
  today?: Date | string;
}) {
  const todayString = typeof input.today === 'string'
    ? input.today
    : input.today
      ? formatDateString(startOfDay(input.today))
      : todayDateString(DEFAULT_LEDGER_TIME_ZONE);
  const todayMonthKey = monthKeyFromDateString(todayString);
  const recurringRulesById = new Map(input.recurringRules.map((rule) => [rule.id, rule]));

  return input.expenses.filter((expense) => {
    if (!expense.recurring_rule_id) {
      return true;
    }

    if (monthKeyFromDateString(expense.spent_on) !== todayMonthKey) {
      return true;
    }

    if (expense.spent_on > todayString) {
      return false;
    }

    const rule = recurringRulesById.get(expense.recurring_rule_id);
    return !rule || rule.is_active;
  });
}

export function compareMonthKeys(a: string, b: string) {
  return monthStart(a).getTime() - monthStart(b).getTime();
}

export function addMonths(monthKey: string, amount: number) {
  const date = monthStart(monthKey);
  date.setMonth(date.getMonth() + amount);
  return toMonthKey(date);
}

export function formatMonthLabel(monthKey: string) {
  const [year, month] = parseMonthKey(monthKey);
  return monthFormatter.format(new Date(year, month - 1, 1));
}

export function monthStartDateString(monthKey: string) {
  return `${monthKey}-01`;
}

export function monthEndDateString(monthKey: string) {
  const [year, month] = parseMonthKey(monthKey);
  const date = new Date(year, month, 0);
  return formatDateString(date);
}

export function resolveDashboardDateRange(
  period: DashboardPeriod,
  monthKey: string,
  today: Date | string = new Date(),
  offset = 0
): DashboardDateRange {
  const todayDate = typeof today === 'string' ? parseDateString(today) : startOfDay(today);

  if (period === 'today') {
    return resolveTodayDateRange(addDays(todayDate, offset));
  }

  if (period === 'week') {
    return resolveWeekDateRange(addDays(todayDate, offset * 7));
  }

  return resolveMonthDateRange(addMonths(monthKey, offset), todayDate);
}

function resolveTodayDateRange(todayDate: Date): DashboardDateRange {
  const todayString = formatDateString(todayDate);
  const yesterday = addDays(todayDate, -1);
  const yesterdayString = formatDateString(yesterday);

  return {
    period: 'today',
    effectiveMonthKey: toMonthKey(todayDate),
    startDateString: todayString,
    endDateString: todayString,
    comparisonStartDateString: yesterdayString,
    comparisonEndDateString: yesterdayString,
    label: formatDashboardDayLabel(todayString),
    comparisonLabel: 'vs yesterday'
  };
}

function resolveWeekDateRange(todayDate: Date): DashboardDateRange {
  const todayString = formatDateString(todayDate);
  const weekStart = startOfWeekMonday(todayDate);
  const weekStartString = formatDateString(weekStart);
  const elapsedDays = daysBetween(weekStart, todayDate);
  const comparisonStart = addDays(weekStart, -7);
  const comparisonEnd = addDays(comparisonStart, elapsedDays);

  return {
    period: 'week',
    effectiveMonthKey: toMonthKey(todayDate),
    startDateString: weekStartString,
    endDateString: todayString,
    comparisonStartDateString: formatDateString(comparisonStart),
    comparisonEndDateString: formatDateString(comparisonEnd),
    label: formatRangeLabel(weekStartString, todayString),
    comparisonLabel: 'vs last week'
  };
}

function resolveMonthDateRange(monthKey: string, todayDate: Date): DashboardDateRange {
  const effectiveMonthKey = monthKey;
  const monthStartString = monthStartDateString(effectiveMonthKey);
  const monthEndString = monthEndDateString(effectiveMonthKey);
  const todayString = formatDateString(todayDate);
  const selectedMonthIsCurrent = effectiveMonthKey === toMonthKey(todayDate);
  const periodEndString = selectedMonthIsCurrent ? todayString : monthEndString;
  const comparisonMonthKey = addMonths(effectiveMonthKey, -1);
  const comparisonStartString = monthStartDateString(comparisonMonthKey);
  const comparisonEndString = selectedMonthIsCurrent
    ? formatDateString(minDate(
        addDays(parseDateString(comparisonStartString), daysBetween(parseDateString(monthStartString), todayDate)),
        parseDateString(monthEndDateString(comparisonMonthKey))
      ))
    : monthEndDateString(comparisonMonthKey);

  return {
    period: 'month',
    effectiveMonthKey,
    startDateString: monthStartString,
    endDateString: periodEndString,
    comparisonStartDateString: comparisonStartString,
    comparisonEndDateString: comparisonEndString,
    label: formatMonthLabel(effectiveMonthKey),
    comparisonLabel: `vs ${formatShortMonthLabel(comparisonMonthKey)}`
  };
}

export function resolveDashboardPeriodNavigation(input: {
  minimumMonthKey?: string | null;
  monthKey: string;
  offset: number;
  period: DashboardPeriod;
  today?: Date | string;
}): DashboardPeriodNavigation {
  const dateRange = resolveDashboardDateRange(input.period, input.monthKey, input.today, input.offset);
  const minimumDateString = input.minimumMonthKey ? monthStartDateString(input.minimumMonthKey) : null;
  return {
    canGoNext: input.offset < 0,
    canGoPrevious: minimumDateString ? dateRange.comparisonStartDateString > minimumDateString : true,
    label: dateRange.label
  };
}

export function daysRemainingIncludingToday(monthKey: string, todayString: string) {
  const monthDays = daysInMonth(monthKey);
  const todayMonthKey = monthKeyFromDateString(todayString);
  const monthPosition = compareMonthKeys(monthKey, todayMonthKey);
  if (monthPosition < 0) {
    return 0;
  }
  if (monthPosition > 0) {
    return monthDays;
  }

  const todayDay = Number(todayString.slice(8, 10));
  if (!Number.isFinite(todayDay) || todayDay <= 0) {
    return monthDays;
  }
  return Math.max(1, monthDays - Math.min(todayDay, monthDays) + 1);
}

export function buildDashboardBudgetSummary(input: {
  monthKey: string;
  stats: Pick<
    DashboardPeriodStats,
    'budgetedVariableTotalYen' | 'categories' | 'fixedTotalYen' | 'unbudgetedVariableTotalYen' | 'variableTotalYen'
  >;
  todayString: string;
}): DashboardBudgetSummary {
  const budgetYen = input.stats.categories.reduce((sum, category) => (
    category.hasBudget ? sum + (category.budgetYen || 0) : sum
  ), 0);
  const budgetedSpendYen = input.stats.budgetedVariableTotalYen;
  const remainingYen = budgetYen - budgetedSpendYen;
  const monthDays = daysInMonth(input.monthKey);
  const daysRemaining = daysRemainingIncludingToday(input.monthKey, input.todayString);
  const dailyAllowanceYen = budgetYen > 0
    ? remainingYen > 0 && daysRemaining > 0
      ? Math.floor(remainingYen / daysRemaining)
      : 0
    : null;
  const usedRatio = budgetYen > 0 ? budgetedSpendYen / budgetYen : 0;
  const elapsedDays = Math.max(0, monthDays - daysRemaining);

  return {
    budgetYen,
    budgetedSpendYen,
    dailyAllowanceYen,
    daysRemaining,
    fixedYen: input.stats.fixedTotalYen,
    hasBudget: budgetYen > 0,
    monthDays,
    paceRatio: monthDays > 0 ? elapsedDays / monthDays : 0,
    remainingYen,
    unbudgetedVariableYen: input.stats.unbudgetedVariableTotalYen,
    usedPercent: usedRatio * 100,
    usedRatio,
    variableYen: input.stats.variableTotalYen
  };
}

export function buildDashboardPeriodStats(input: {
  expenses: Expense[];
  monthKey: string;
  period: DashboardPeriod;
  currentUserId: string | null;
  otherUserId: string | null;
  budgets?: DashboardCategoryBudget[] | null;
  offset?: number;
  today?: Date | string;
  viewerUserId?: string | null;
}): DashboardPeriodStats {
  const dateRange = resolveDashboardDateRange(input.period, input.monthKey, input.today, input.offset || 0);
  const userIds = [input.currentUserId, input.otherUserId].filter((userId): userId is string => Boolean(userId));
  const periodExpenses = expensesInRange(input.expenses, dateRange.startDateString, dateRange.endDateString);
  const comparisonExpenses = expensesInRange(
    input.expenses,
    dateRange.comparisonStartDateString,
    dateRange.comparisonEndDateString
  );
  const userColorById = buildUserColorMap(userIds, input.currentUserId);
  const rawTotalYen = periodExpenses.reduce((sum, expense) => sum + expense.amount_yen, 0);
  const memberTotals = userIds.map((userId) => {
    const amountYen = periodExpenses.reduce((sum, expense) => sum + amountForUser(expense, userId), 0);
    return {
      userId,
      amountYen,
      percentage: rawTotalYen > 0 ? (amountYen / rawTotalYen) * 100 : 0,
      color: userColorById.get(userId) || DEFAULT_USER_COLOR
    };
  });
  const viewerUserId = input.viewerUserId ?? null;
  const viewerPeriodExpenses = scopeExpensesToViewer(periodExpenses, viewerUserId);
  const viewerComparisonExpenses = scopeExpensesToViewer(comparisonExpenses, viewerUserId);
  const totalYen = viewerPeriodExpenses.reduce((sum, expense) => sum + expense.amount_yen, 0);
  const fixedPeriodExpenses = viewerPeriodExpenses.filter(isFixedExpense);
  const variablePeriodExpenses = viewerPeriodExpenses.filter(isVariableExpense);
  const variableComparisonExpenses = viewerComparisonExpenses.filter(isVariableExpense);
  const variableDailyUserExpenses = periodExpenses.filter(isVariableExpense);
  const fixedTotalYen = fixedPeriodExpenses.reduce((sum, expense) => sum + expense.amount_yen, 0);
  const variableTotalYen = variablePeriodExpenses.reduce((sum, expense) => sum + expense.amount_yen, 0);
  const previousVariableTotalYen = variableComparisonExpenses.reduce((sum, expense) => sum + expense.amount_yen, 0);
  const budgetsByCategory = buildBudgetMap(input.budgets);
  const budgetedCategoryIds = [...budgetsByCategory.keys()];
  const budgetedVariableTotalYen = totalForBudgetedCategories(variablePeriodExpenses, budgetsByCategory);
  const unbudgetedVariableTotalYen = Math.max(0, variableTotalYen - budgetedVariableTotalYen);
  const categories = buildDashboardCategoryStats({
    budgetsByCategory,
    expenses: variablePeriodExpenses,
    totalYen: variableTotalYen
  });
  const fixedCategories = buildDashboardCategoryStats({
    expenses: fixedPeriodExpenses,
    totalYen: fixedTotalYen
  });
  const categoryDetailInput = {
    categories,
    comparisonExpenses: variableComparisonExpenses,
    currentUserId: input.currentUserId,
    dateRange,
    otherUserId: input.otherUserId,
    periodExpenses: variablePeriodExpenses,
    today: input.today,
    totalYen: variableTotalYen,
    viewerUserId
  };
  const stats = {
    totalYen,
    count: viewerPeriodExpenses.length,
    budgetedCategoryIds,
    budgetedVariableTotalYen,
    categories,
    dailySeries: buildDailySeries(dateRange.effectiveMonthKey, dateRange.endDateString, amountsByDate(variablePeriodExpenses)),
    dailyUserSeries: buildDashboardDailyUserSeries({
      expenses: variableDailyUserExpenses,
      startDateString: dateRange.startDateString,
      endDateString: dateRange.endDateString,
      userIds
    }),
    comparison: buildComparisonStat(variableTotalYen, previousVariableTotalYen, dateRange.comparisonLabel),
    dateRange,
    fixedCategories,
    fixedTotalYen,
    getCategoryDetail: (detailKey: string | null | undefined) => buildDashboardCategoryDetail(categoryDetailInput, detailKey),
    memberTotals,
    unbudgetedVariableTotalYen,
    variableTotalYen
  };

  return Object.defineProperty(stats, 'categoryDetails', {
    enumerable: true,
    get: () => buildDashboardCategoryDetails(categoryDetailInput)
  }) as DashboardPeriodStats;
}

/**
 * Reinterprets each expense's amount_yen as just the viewer's attributed share
 * (via amountForUser) and drops expenses the viewer has no stake in, so every
 * downstream aggregation that reads expense.amount_yen "just works" for a
 * self-only perspective. Passing a null viewerUserId returns the input as-is.
 */
function scopeExpensesToViewer(expenses: Expense[], viewerUserId: string | null): Expense[] {
  if (!viewerUserId) {
    return expenses;
  }

  return expenses
    .map((expense) => ({ ...expense, amount_yen: amountForUser(expense, viewerUserId) }))
    .filter((expense) => expense.amount_yen > 0);
}

export function isFixedExpense(expense: Pick<Expense, 'recurring_rule_id'>) {
  return Boolean(expense.recurring_rule_id);
}

export function isVariableExpense(expense: Pick<Expense, 'recurring_rule_id'>) {
  return !isFixedExpense(expense);
}

function totalForBudgetedCategories(expenses: Expense[], budgetsByCategory: Map<string, number>) {
  return expenses.reduce((sum, expense) => (
    budgetsByCategory.has(expenseCategoryId(expense)) ? sum + expense.amount_yen : sum
  ), 0);
}

export function buildDashboardHeatDays(input: {
  expenses: Expense[];
  monthKey: string;
  members: LedgerMemberProfile[];
  currentUserId: string | null;
  today?: Date | string;
  viewerUserId?: string | null;
}): HeatDay[] {
  const todayString = typeof input.today === 'string'
    ? input.today
    : input.today
      ? formatDateString(startOfDay(input.today))
      : todayDateString(DEFAULT_LEDGER_TIME_ZONE);
  const isCurrentMonth = input.monthKey === monthKeyFromDateString(todayString);
  const monthStartString = monthStartDateString(input.monthKey);
  const monthEndStringValue = monthEndDateString(input.monthKey);
  const dates = dateStringsInRange(monthStartString, monthEndStringValue);
  const userIds = input.members.map((member) => member.user_id);
  const userColorById = buildUserColorMap(userIds, input.currentUserId);
  const viewerUserId = input.viewerUserId ?? null;
  const viewerExpenses = scopeExpensesToViewer(input.expenses, viewerUserId).filter(isVariableExpense);
  const categoryAmountsByDate = new Map<string, Map<string, number>>();
  const memberAmountsByDate = new Map<string, Map<string, number>>();
  const totalsByDate = new Map<string, number>();
  const countsByDate = new Map<string, number>();

  for (const date of dates) {
    categoryAmountsByDate.set(date, new Map());
    memberAmountsByDate.set(date, new Map(userIds.map((userId) => [userId, 0])));
    totalsByDate.set(date, 0);
    countsByDate.set(date, 0);
  }

  for (const expense of viewerExpenses) {
    if (monthKeyFromDateString(expense.spent_on) !== input.monthKey) {
      continue;
    }

    if (isCurrentMonth && expense.spent_on > todayString) {
      continue;
    }

    const categoryAmounts = categoryAmountsByDate.get(expense.spent_on);
    const memberAmounts = memberAmountsByDate.get(expense.spent_on);
    if (!categoryAmounts || !memberAmounts) {
      continue;
    }

    const categoryId = expenseCategoryId(expense);
    categoryAmounts.set(categoryId, (categoryAmounts.get(categoryId) || 0) + expense.amount_yen);
    totalsByDate.set(expense.spent_on, (totalsByDate.get(expense.spent_on) || 0) + expense.amount_yen);
    countsByDate.set(expense.spent_on, (countsByDate.get(expense.spent_on) || 0) + 1);

    for (const userId of userIds) {
      memberAmounts.set(userId, (memberAmounts.get(userId) || 0) + amountForUser(expense, userId));
    }
  }

  return dates.map((date) => ({
    date,
    amount: totalsByDate.get(date) || 0,
    count: countsByDate.get(date) || 0,
    byCategory: [...(categoryAmountsByDate.get(date)?.entries() || [])]
      .sort((a, b) => b[1] - a[1] || categoryLabel(a[0]).localeCompare(categoryLabel(b[0])))
      .slice(0, 4)
      .map(([categoryId, amount]) => ({
        id: categoryId,
        label: categoryLabel(categoryId),
        color: categoryColor(categoryId),
        amount
      })),
    byMember: viewerUserId ? [] : input.members.map((member) => ({
      id: member.user_id,
      label: displayName(member.profile.display_name),
      color: userColorById.get(member.user_id) || DEFAULT_USER_COLOR,
      amount: memberAmountsByDate.get(date)?.get(member.user_id) || 0
    }))
  }));
}

const HEAT_SCALE_PERCENTILE = 0.9;
const DEFAULT_HEAT_ACTIVE_LEVEL_COUNT = 4;
const TREND_VISUAL_EXPONENT = 0.72;

export function heatScaleMaxForAmounts(amounts: number[]) {
  const positiveAmounts = amounts
    .filter((amount) => Number.isFinite(amount) && amount > 0)
    .sort((a, b) => a - b);

  if (positiveAmounts.length === 0) {
    return 0;
  }

  if (positiveAmounts.length === 1) {
    return positiveAmounts[0];
  }

  if (positiveAmounts.length < 4) {
    const maxAmount = positiveAmounts[positiveAmounts.length - 1];
    const nextHighestAmount = positiveAmounts[positiveAmounts.length - 2];
    return maxAmount >= nextHighestAmount * 4 ? nextHighestAmount : maxAmount;
  }

  const percentileIndex = Math.floor((positiveAmounts.length - 1) * HEAT_SCALE_PERCENTILE);
  return positiveAmounts[percentileIndex];
}

export function heatLevelForAmount(
  amount: number,
  maxAmount: number,
  activeLevelCount = DEFAULT_HEAT_ACTIVE_LEVEL_COUNT
) {
  if (amount <= 0 || maxAmount <= 0 || activeLevelCount <= 0) {
    return 0;
  }

  const levelCount = Math.max(1, Math.floor(activeLevelCount));
  return Math.min(levelCount, Math.max(1, Math.ceil((amount / maxAmount) * levelCount)));
}

export function trendScaleMaxForAmounts(amounts: number[]) {
  return heatScaleMaxForAmounts(amounts);
}

export function trendVisualRatioForAmount(amount: number, scaleMaxAmount: number) {
  if (amount <= 0 || scaleMaxAmount <= 0) {
    return 0;
  }

  const linearRatio = clamp(amount / scaleMaxAmount, 0, 1);
  return Math.pow(linearRatio, TREND_VISUAL_EXPONENT);
}

export function trendAmountForVisualRatio(ratio: number, scaleMaxAmount: number) {
  if (ratio <= 0 || scaleMaxAmount <= 0) {
    return 0;
  }

  return Math.pow(clamp(ratio, 0, 1), 1 / TREND_VISUAL_EXPONENT) * scaleMaxAmount;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function buildHistorySummary(input: {
  activeFilterCount: number;
  expenses: { displayAmountYen: number; expense: Pick<Expense, 'category' | 'category_id' | 'spent_on' | 'subcategory'> }[];
  monthKey: string;
  today?: Date | string;
}): HistorySummaryStat {
  const totalYen = input.expenses.reduce((sum, item) => sum + item.displayAmountYen, 0);
  const amountsByDate = new Map<string, number>();
  const amountsByCategory = createEmptyCategoryAmounts();
  const monthStartString = monthStartDateString(input.monthKey);
  const todayString = typeof input.today === 'string'
    ? input.today
    : input.today
      ? formatDateString(startOfDay(input.today))
      : todayDateString(DEFAULT_LEDGER_TIME_ZONE);
  const endDateString = input.monthKey === monthKeyFromDateString(todayString)
    ? todayString
    : monthEndDateString(input.monthKey);

  for (const item of input.expenses) {
    amountsByDate.set(item.expense.spent_on, (amountsByDate.get(item.expense.spent_on) || 0) + item.displayAmountYen);
    const categoryId = expenseCategoryId(item.expense);
    amountsByCategory[categoryId] += item.displayAmountYen;
  }

  const peakEntry = [...amountsByDate.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const categoryMix = categoryAmountEntries(amountsByCategory)
    .filter((entry) => entry.amountYen > 0)
    .sort((a, b) => b.amountYen - a.amountYen || a.label.localeCompare(b.label))
    .map((entry) => ({
      ...entry,
      percentage: totalYen > 0 ? (entry.amountYen / totalYen) * 100 : 0
    }));
  const topCategory = categoryMix[0] || null;
  const elapsedDays = Math.max(1, daysBetween(parseDateString(monthStartString), parseDateString(endDateString)) + 1);

  return {
    activeFilterCount: input.activeFilterCount,
    averagePerDayYen: Math.round(totalYen / elapsedDays),
    categoryMix,
    count: input.expenses.length,
    dateSpanLabel: `${formatRangeLabel(monthStartString, endDateString)} · ${input.activeFilterCount} filters`,
    peakDay: {
      amountYen: peakEntry?.[1] || 0,
      date: peakEntry?.[0] || null,
      label: peakEntry ? formatDashboardDayLabel(peakEntry[0]) : '--'
    },
    topCategoryCaption: topCategory ? `${topCategory.label} · ${Math.round(topCategory.percentage)}% top category` : 'No category spend',
    totalYen
  };
}

export function closedMonthKeys(input: {
  endBeforeMonthKey?: string;
  startMonthKey: string;
}): string[] {
  const lastClosedMonthKey = addMonths(input.endBeforeMonthKey || currentMonthKey(), -1);
  if (compareMonthKeys(input.startMonthKey, lastClosedMonthKey) > 0) {
    return [];
  }

  const keys: string[] = [];
  for (let monthKey = lastClosedMonthKey; compareMonthKeys(monthKey, input.startMonthKey) >= 0; monthKey = addMonths(monthKey, -1)) {
    keys.push(monthKey);
  }
  return keys;
}

export function buildMonthlyReceipts(input: {
  currentUserId: string | null;
  endBeforeMonthKey?: string;
  expenses: Expense[];
  otherUserId: string | null;
  startMonthKey: string;
}): MonthlyReceiptStat[] {
  const monthKeys = closedMonthKeys({
    endBeforeMonthKey: input.endBeforeMonthKey,
    startMonthKey: input.startMonthKey
  });
  const totalsByMonth = new Map<string, number>();
  const recordsByMonth = new Map<string, number>();
  const currentUserAmountsByMonth = new Map<string, number>();
  const categoryAmountsByMonth = new Map<string, Record<PrimaryCategoryId, number>>();

  for (const expense of input.expenses) {
    const monthKey = monthKeyFromDateString(expense.spent_on);
    totalsByMonth.set(monthKey, (totalsByMonth.get(monthKey) || 0) + expense.amount_yen);
    recordsByMonth.set(monthKey, (recordsByMonth.get(monthKey) || 0) + 1);

    if (input.currentUserId) {
      currentUserAmountsByMonth.set(
        monthKey,
        (currentUserAmountsByMonth.get(monthKey) || 0) + amountForUser(expense, input.currentUserId)
      );
    }

    const categoryAmounts = categoryAmountsByMonth.get(monthKey) || createEmptyCategoryAmounts();
    categoryAmounts[expenseCategoryId(expense)] += expense.amount_yen;
    categoryAmountsByMonth.set(monthKey, categoryAmounts);
  }

  return monthKeys.filter((monthKey) => (
    (recordsByMonth.get(monthKey) || 0) > 0 &&
    (totalsByMonth.get(monthKey) || 0) > 0
  )).map((monthKey) => {
    const previousMonthKey = addMonths(monthKey, -1);
    const totalYen = totalsByMonth.get(monthKey) || 0;
    const previousTotalYen = totalsByMonth.get(previousMonthKey) || 0;
    const currentUserAmount = currentUserAmountsByMonth.get(monthKey) || 0;
    const alexPercentage = totalYen > 0 ? Math.round((currentUserAmount / totalYen) * 100) : 50;
    const alexAmountYen = totalYen > 0 ? currentUserAmount : 0;
    const categoryAmounts = categoryAmountsByMonth.get(monthKey) || createEmptyCategoryAmounts();
    const previousCategoryAmounts = categoryAmountsByMonth.get(previousMonthKey) || createEmptyCategoryAmounts();
    const days = daysInMonth(monthKey);
    const activeCategoryCount = categoryAmountEntries(categoryAmounts).filter((entry) => entry.amountYen > 0).length;
    const comparisonPercentage = previousTotalYen > 0 ? ((totalYen - previousTotalYen) / previousTotalYen) * 100 : null;

    return {
      activeCategoryCount,
      alexAmountYen,
      alexPercentage,
      categoryAmounts,
      code: monthKey,
      comparison: {
        direction: totalYen > previousTotalYen ? 'over' : totalYen < previousTotalYen ? 'under' : 'same',
        label: formatShortMonthLabel(previousMonthKey),
        percentage: comparisonPercentage,
        previousTotalYen
      },
      dailyAverageYen: Math.round(totalYen / days),
      days,
      label: formatReceiptMonthLabel(monthKey).toUpperCase(),
      lines: PRIMARY_CATEGORIES.map((category) => buildReceiptLine(category.id, categoryAmounts, previousCategoryAmounts)),
      minaAmountYen: totalYen - alexAmountYen,
      minaPercentage: 100 - alexPercentage,
      monthKey,
      previousMonthKey,
      records: recordsByMonth.get(monthKey) || 0,
      span: formatReceiptSpan(monthKey),
      totalYen
    };
  });
}

function buildDashboardCategoryStats(input: {
  budgetsByCategory?: Map<string, number>;
  expenses: Expense[];
  totalYen: number;
}): CategoryStat[] {
  const amountsByCategory = new Map<string, number>();
  for (const expense of input.expenses) {
    const categoryId = expenseCategoryId(expense);
    amountsByCategory.set(categoryId, (amountsByCategory.get(categoryId) || 0) + expense.amount_yen);
  }

  const budgetsByCategory = input.budgetsByCategory || new Map<string, number>();
  for (const categoryId of budgetsByCategory.keys()) {
    if (!amountsByCategory.has(categoryId)) {
      amountsByCategory.set(categoryId, 0);
    }
  }

  const sortedCategories = [...amountsByCategory.entries()].sort(compareCategoryEntries);
  const otherEntry = sortedCategories.find(([category]) => category === 'other');
  const sortedNamedCategories = sortedCategories.filter(([category]) => category !== 'other');
  const shouldAggregateOther = sortedCategories.length > DASHBOARD_CATEGORY_LIMIT;
  const aggregateSources = shouldAggregateOther
    ? [
        ...sortedNamedCategories.slice(DASHBOARD_CATEGORY_LIMIT - 1),
        ...(otherEntry ? [otherEntry] : [])
      ]
    : [];
  const visibleEntries = shouldAggregateOther
    ? [
        ...sortedNamedCategories.slice(0, DASHBOARD_CATEGORY_LIMIT - 1),
        [
          'other',
          aggregateSources.reduce((sum, [, amountYen]) => sum + amountYen, 0)
        ] as [string, number]
      ]
    : [
        ...sortedNamedCategories,
        ...(otherEntry ? [otherEntry] : [])
      ];

  return visibleEntries.map(([categoryId, amountYen], index) => {
    const sourceCategories = shouldAggregateOther && index === DASHBOARD_CATEGORY_LIMIT - 1
      ? aggregateSources.map(([sourceCategory]) => sourceCategory)
      : [categoryId];
    const budgetedSpendYen = sourceCategories.reduce((sum, sourceCategory) => (
      budgetsByCategory.has(sourceCategory)
        ? sum + (amountsByCategory.get(sourceCategory) || 0)
        : sum
    ), 0);
    const unbudgetedSpendYen = Math.max(0, amountYen - budgetedSpendYen);
    const budgetSummary = budgetSummaryForCategories(budgetsByCategory, sourceCategories, budgetedSpendYen);
    return {
      category: categoryLabel(categoryId),
      amountYen,
      budgetedSpendYen,
      ...budgetSummary,
      percentage: input.totalYen > 0 ? (amountYen / input.totalYen) * 100 : 0,
      color: index === DASHBOARD_CATEGORY_LIMIT - 1 && shouldAggregateOther
        ? DASHBOARD_OTHER_CATEGORY_COLOR
        : categoryColor(categoryId),
      detailKey: detailKeyForSourceCategories(sourceCategories),
      sourceCategories,
      unbudgetedSpendYen
    };
  });
}

function buildBudgetMap(budgets: DashboardCategoryBudget[] | null | undefined) {
  const budgetByCategory = new Map<string, number>();
  for (const budget of budgets || []) {
    if (!budget.categoryId) {
      continue;
    }
    const categoryId = getPrimaryCategory(budget.categoryId).id;
    budgetByCategory.set(categoryId, budget.amountYen);
  }
  return budgetByCategory;
}

function budgetSummaryForCategories(
  budgetsByCategory: Map<string, number>,
  sourceCategories: string[],
  amountYen: number
): Pick<CategoryStat, 'budgetStatus' | 'budgetUsedPercent' | 'budgetYen' | 'hasBudget' | 'remainingBudgetYen'> {
  let hasBudget = false;
  let budgetYen = 0;
  for (const categoryId of sourceCategories) {
    if (!budgetsByCategory.has(categoryId)) {
      continue;
    }
    hasBudget = true;
    budgetYen += budgetsByCategory.get(categoryId) || 0;
  }

  if (!hasBudget) {
    return { hasBudget: false };
  }

  const remainingBudgetYen = budgetYen - amountYen;
  const budgetUsedPercent = budgetYen > 0
    ? (amountYen / budgetYen) * 100
    : amountYen > 0
      ? 100
      : 0;
  const budgetStatus: BudgetStatus = amountYen > budgetYen
    ? 'over'
    : budgetYen > 0 && budgetUsedPercent >= 80
      ? 'near'
      : 'under';

  return {
    budgetStatus,
    budgetUsedPercent,
    budgetYen,
    hasBudget: true,
    remainingBudgetYen
  };
}

type DashboardCategoryDetailInput = {
  categories: CategoryStat[];
  comparisonExpenses: Expense[];
  currentUserId: string | null;
  dateRange: DashboardDateRange;
  otherUserId: string | null;
  periodExpenses: Expense[];
  today?: Date | string;
  totalYen: number;
  viewerUserId?: string | null;
};

type DashboardCategoryDetailContext = {
  dates: string[];
  denominatorDays: number;
  userColorById: Map<string, string>;
  userIds: string[];
};

function buildDashboardCategoryDetails(input: DashboardCategoryDetailInput): CategoryDetailStat[] {
  const context = createDashboardCategoryDetailContext(input);
  return input.categories.map((category) => buildDashboardCategoryDetailForCategory(input, context, category));
}

function buildDashboardCategoryDetail(
  input: DashboardCategoryDetailInput,
  detailKey: string | null | undefined
): CategoryDetailStat | null {
  if (!detailKey) {
    return null;
  }

  const category = input.categories.find((item) => item.detailKey === detailKey);
  if (!category) {
    return null;
  }

  return buildDashboardCategoryDetailForCategory(
    input,
    createDashboardCategoryDetailContext(input),
    category
  );
}

function createDashboardCategoryDetailContext(input: DashboardCategoryDetailInput): DashboardCategoryDetailContext {
  const userIds = [input.currentUserId, input.otherUserId].filter((userId): userId is string => Boolean(userId));
  return {
    dates: dateStringsInRange(input.dateRange.startDateString, input.dateRange.endDateString),
    denominatorDays: dashboardAverageDayCount(input.dateRange, input.today),
    userColorById: buildUserColorMap(userIds, input.currentUserId),
    userIds
  };
}

function buildDashboardCategoryDetailForCategory(
  input: DashboardCategoryDetailInput,
  context: DashboardCategoryDetailContext,
  category: CategoryStat
): CategoryDetailStat {
  const sourceCategories = category.sourceCategories?.length
    ? category.sourceCategories
    : [resolveCategory({ category: category.category }).categoryId];
  const sourceCategorySet = new Set(sourceCategories);
  const categoryExpenses = input.periodExpenses.filter((expense) => sourceCategorySet.has(expenseCategoryId(expense)));
  const previousAmountYen = input.comparisonExpenses
    .filter((expense) => sourceCategorySet.has(expenseCategoryId(expense)))
    .reduce((sum, expense) => sum + expense.amount_yen, 0);
  const dailyAmountsByDate = amountsByDate(categoryExpenses);
  const peakAmountYen = Math.max(0, ...context.dates.map((date) => dailyAmountsByDate.get(date) || 0));
  const peakDate = context.dates.find((date) => (dailyAmountsByDate.get(date) || 0) === peakAmountYen && peakAmountYen > 0) || null;
  const memberSplits = input.viewerUserId ? [] : context.userIds.map((userId) => {
    const amountYen = categoryExpenses.reduce((sum, expense) => sum + amountForUser(expense, userId), 0);
    return {
      amountYen,
      color: context.userColorById.get(userId) || DEFAULT_USER_COLOR,
      percentage: category.amountYen > 0 ? (amountYen / category.amountYen) * 100 : 0,
      userId
    };
  });
  const isAggregate = sourceCategories.length > 1;

  return {
    amountYen: category.amountYen,
    averagePerDayYen: Math.round(category.amountYen / context.denominatorDays),
    breakdown: isAggregate
      ? buildCategoryBreakdown(categoryExpenses, sourceCategories, category.amountYen)
      : buildSubcategoryBreakdown(categoryExpenses, sourceCategories[0], category.amountYen),
    breakdownKind: isAggregate ? 'category' : 'subcategory',
    budgetStatus: category.budgetStatus,
    budgetUsedPercent: category.budgetUsedPercent,
    budgetYen: category.budgetYen,
    category: category.category,
    color: category.color,
    comparison: buildAmountComparison(category.amountYen, previousAmountYen),
    daily: context.dates.map((date) => {
      const amountYen = dailyAmountsByDate.get(date) || 0;
      return {
        amountYen,
        date,
        isPeak: peakAmountYen > 0 && amountYen === peakAmountYen,
        label: String(Number(date.slice(8, 10)))
      };
    }),
    detailKey: category.detailKey,
    hasBudget: category.hasBudget,
    icon: categoryIconName(sourceCategories.length === 1 ? sourceCategories[0] : 'other'),
    memberSplits,
    remainingBudgetYen: category.remainingBudgetYen,
    shareOfTotal: input.totalYen > 0 ? (category.amountYen / input.totalYen) * 100 : 0,
    sourceCategories,
    topDay: {
      amountYen: peakAmountYen,
      date: peakDate,
      label: peakDate ? String(Number(peakDate.slice(8, 10))) : '--'
    },
    transactions: categoryExpenses.length
  };
}

function buildSubcategoryBreakdown(
  expenses: Expense[],
  categoryId: string,
  totalYen: number
): CategoryDetailBreakdownItem[] {
  const amountsBySubcategory = new Map<string, number>();
  const category = getPrimaryCategory(categoryId);
  const presetOrder = new Map<string, number>(category.subcategories.map((subcategory, index) => [subcategory, index]));

  for (const expense of expenses) {
    const resolved = resolveCategory({
      category: expense.category,
      categoryId: expense.category_id,
      subcategory: expense.subcategory
    });
    const label = resolved.subcategory || 'Uncategorized';
    amountsBySubcategory.set(label, (amountsBySubcategory.get(label) || 0) + expense.amount_yen);
  }

  return [...amountsBySubcategory.entries()]
    .sort((a, b) => {
      const aOrder = presetOrder.get(a[0]) ?? Number.POSITIVE_INFINITY;
      const bOrder = presetOrder.get(b[0]) ?? Number.POSITIVE_INFINITY;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return b[1] - a[1] || a[0].localeCompare(b[0]);
    })
    .map(([label, amountYen]) => ({
      amountYen,
      color: category.color,
      icon: category.icon,
      key: label,
      label,
      percentage: totalYen > 0 ? (amountYen / totalYen) * 100 : 0
    }));
}

function buildCategoryBreakdown(
  expenses: Expense[],
  sourceCategories: string[],
  totalYen: number
): CategoryDetailBreakdownItem[] {
  const amountsByCategory = new Map<string, number>();
  for (const expense of expenses) {
    const categoryId = expenseCategoryId(expense);
    amountsByCategory.set(categoryId, (amountsByCategory.get(categoryId) || 0) + expense.amount_yen);
  }

  return sourceCategories
    .map((categoryId) => ({
      amountYen: amountsByCategory.get(categoryId) || 0,
      category: getPrimaryCategory(categoryId)
    }))
    .filter((item) => item.amountYen > 0)
    .map(({ amountYen, category }) => ({
      amountYen,
      color: category.color,
      icon: category.icon,
      key: category.id,
      label: category.label,
      percentage: totalYen > 0 ? (amountYen / totalYen) * 100 : 0
    }));
}

function detailKeyForSourceCategories(sourceCategories: string[]) {
  return sourceCategories.length === 1
    ? sourceCategories[0]
    : `aggregate:${sourceCategories.join('+')}`;
}

function dashboardAverageDayCount(dateRange: DashboardDateRange, today?: Date | string) {
  const todayString = typeof today === 'string'
    ? today
    : today
      ? formatDateString(startOfDay(today))
      : todayDateString(DEFAULT_LEDGER_TIME_ZONE);
  const clampedEndString = todayString < dateRange.startDateString
    ? dateRange.startDateString
    : todayString > dateRange.endDateString
      ? dateRange.endDateString
      : todayString;

  return Math.max(1, daysBetween(parseDateString(dateRange.startDateString), parseDateString(clampedEndString)) + 1);
}

function buildReceiptLine(
  categoryId: PrimaryCategoryId,
  categoryAmounts: Record<PrimaryCategoryId, number>,
  previousCategoryAmounts: Record<PrimaryCategoryId, number>
): ReceiptCategoryLine {
  const category = PRIMARY_CATEGORIES.find((item) => item.id === categoryId)!;
  const amountYen = categoryAmounts[categoryId] || 0;
  const previousAmountYen = previousCategoryAmounts[categoryId] || 0;
  const mom = receiptMom(amountYen, previousAmountYen);

  return {
    amountYen,
    categoryId,
    color: category.color,
    label: category.label,
    momDirection: mom.direction,
    momLabel: mom.label,
    previousAmountYen
  };
}

function receiptMom(
  amountYen: number,
  previousAmountYen: number
): { direction: ReceiptMomDirection; label: string; percentage: number | null } {
  if (previousAmountYen === 0 && amountYen === 0) {
    return { direction: 'flat', label: '—', percentage: null };
  }

  if (previousAmountYen === 0) {
    return { direction: 'new', label: 'NEW', percentage: null };
  }

  const percentage = Math.round(((amountYen - previousAmountYen) / previousAmountYen) * 100);
  if (percentage > 0) {
    return { direction: 'up', label: `+${percentage}%`, percentage };
  }

  if (percentage < 0) {
    return { direction: 'down', label: `−${Math.abs(percentage)}%`, percentage };
  }

  return { direction: 'flat', label: '0%', percentage };
}

export function buildAmountComparison(amountYen: number, previousAmountYen: number): AmountComparisonStat {
  const deltaYen = amountYen - previousAmountYen;
  const mom = receiptMom(amountYen, previousAmountYen);
  const directionByReceiptDirection: Record<ReceiptMomDirection, AmountComparisonDirection> = {
    down: 'under',
    flat: 'same',
    new: 'new',
    up: 'over'
  };

  return {
    deltaYen,
    direction: directionByReceiptDirection[mom.direction],
    label: mom.label,
    percentage: mom.percentage,
    previousAmountYen
  };
}

function createEmptyCategoryAmounts(): Record<PrimaryCategoryId, number> {
  return Object.fromEntries(PRIMARY_CATEGORIES.map((category) => [category.id, 0])) as Record<PrimaryCategoryId, number>;
}

function categoryAmountEntries(categoryAmounts: Record<PrimaryCategoryId, number>) {
  return PRIMARY_CATEGORIES.map((category) => ({
    amountYen: categoryAmounts[category.id] || 0,
    categoryId: category.id,
    color: category.color,
    label: category.label
  }));
}

function daysInMonth(monthKey: string) {
  return Number(monthEndDateString(monthKey).slice(8, 10));
}

function formatReceiptMonthLabel(monthKey: string) {
  const [year, month] = parseMonthKey(monthKey);
  return receiptMonthFormatter.format(new Date(year, month - 1, 1));
}

function formatReceiptSpan(monthKey: string) {
  const [year, month] = parseMonthKey(monthKey);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const monthLabel = shortMonthFormatter.format(start);
  return `${monthLabel} 1-${end.getDate()}`;
}

function compareCategoryEntries(a: [string, number], b: [string, number]) {
  if (a[0] === 'other' && b[0] !== 'other') {
    return 1;
  }

  if (b[0] === 'other' && a[0] !== 'other') {
    return -1;
  }

  return b[1] - a[1] || categoryLabel(a[0]).localeCompare(categoryLabel(b[0]));
}

export function buildDashboardDailyUserSeriesForCategories(input: {
  expenses: Expense[];
  categories: string[];
  startDateString: string;
  endDateString: string;
  userIds: string[];
}) {
  const categorySet = new Set(input.categories);
  return buildDashboardDailyUserSeries({
    expenses: input.expenses.filter((expense) => categorySet.has(expenseCategoryId(expense))),
    startDateString: input.startDateString,
    endDateString: input.endDateString,
    userIds: input.userIds
  });
}

function buildDashboardDailyUserSeries(input: {
  expenses: Expense[];
  startDateString: string;
  endDateString: string;
  userIds: string[];
}): DailyUserStat[] {
  const dates = dateStringsInRange(input.startDateString, input.endDateString);
  const amountsByDate = new Map<string, Record<string, number>>();
  const totalsByDate = new Map<string, number>();

  for (const date of dates) {
    amountsByDate.set(date, Object.fromEntries(input.userIds.map((userId) => [userId, 0])));
    totalsByDate.set(date, 0);
  }

  for (const expense of input.expenses) {
    const amounts = amountsByDate.get(expense.spent_on);
    if (!amounts) {
      continue;
    }

    totalsByDate.set(expense.spent_on, (totalsByDate.get(expense.spent_on) || 0) + expense.amount_yen);
    for (const userId of input.userIds) {
      amounts[userId] = (amounts[userId] || 0) + amountForUser(expense, userId);
    }
  }

  return dates.map((date) => ({
    date,
    label: String(Number(date.slice(8, 10))),
    amountsByUserId: amountsByDate.get(date) || {},
    totalAmountYen: totalsByDate.get(date) || 0
  }));
}

export function amountForUser(expense: Expense, userId: string) {
  if (expense.ownership === 'shared') {
    return expense.splits.find((split) => split.user_id === userId)?.amount_yen || 0;
  }

  return expense.paid_by === userId ? expense.amount_yen : 0;
}

function buildDailySeries(monthKey: string, endDateString: string, amountsByDate: Map<string, number>) {
  const [year, month] = parseMonthKey(monthKey);
  const endDay = Number(endDateString.slice(8, 10));
  const series: DailyStat[] = [];

  for (let day = 1; day <= endDay; day += 1) {
    const date = [year, padDatePart(month), padDatePart(day)].join('-');
    series.push({
      date,
      label: `Day ${day}`,
      amountYen: amountsByDate.get(date) || 0
    });
  }

  return series;
}

function amountsByDate(expenses: Expense[]) {
  const nextAmountsByDate = new Map<string, number>();
  for (const expense of expenses) {
    nextAmountsByDate.set(expense.spent_on, (nextAmountsByDate.get(expense.spent_on) || 0) + expense.amount_yen);
  }
  return nextAmountsByDate;
}

export function expenseCategoryId(expense: Pick<Expense, 'category' | 'category_id' | 'subcategory'>) {
  return resolveCategory({
    categoryId: expense.category_id,
    category: expense.category,
    subcategory: expense.subcategory
  }).categoryId;
}

function buildComparisonStat(totalYen: number, previousTotalYen: number, label: string): ComparisonStat {
  const deltaYen = totalYen - previousTotalYen;
  return {
    previousTotalYen,
    deltaYen,
    percentage: previousTotalYen > 0 ? (deltaYen / previousTotalYen) * 100 : null,
    direction: deltaYen < 0 ? 'under' : deltaYen > 0 ? 'over' : 'same',
    label
  };
}

function expensesInRange(expenses: Expense[], startDateString: string, endDateString: string) {
  return expenses.filter((expense) => (
    expense.spent_on >= startDateString && expense.spent_on <= endDateString
  ));
}

function dateStringsInRange(startDateString: string, endDateString: string) {
  const start = parseDateString(startDateString);
  const end = parseDateString(endDateString);
  const dates: string[] = [];

  for (let date = start; date.getTime() <= end.getTime(); date = addDays(date, 1)) {
    dates.push(formatDateString(date));
  }

  return dates;
}

function monthStart(monthKey: string) {
  const [year, month] = parseMonthKey(monthKey);
  return new Date(year, month - 1, 1);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDateString(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function minDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

function daysBetween(start: Date, end: Date) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / millisecondsPerDay);
}

function startOfWeekMonday(date: Date) {
  const day = date.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return addDays(startOfDay(date), -daysSinceMonday);
}

function formatRangeLabel(startDateString: string, endDateString: string) {
  if (startDateString === endDateString) {
    return dayFormatter.format(parseDateString(startDateString));
  }

  const start = parseDateString(startDateString);
  const end = parseDateString(endDateString);
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${shortMonthFormatter.format(start)} ${start.getDate()}-${end.getDate()}`;
  }

  return `${dayFormatter.format(start)}-${dayFormatter.format(end)}`;
}

function formatDashboardDayLabel(dateString: string) {
  return longDayFormatter.format(parseDateString(dateString));
}

function parseMonthKey(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return [year, month] as const;
}

function formatShortMonthLabel(monthKey: string) {
  const [year, month] = parseMonthKey(monthKey);
  return shortMonthFormatter.format(new Date(year, month - 1, 1));
}

function formatDateString(date: Date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate())
  ].join('-');
}
