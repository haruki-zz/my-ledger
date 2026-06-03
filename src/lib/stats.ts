import { CHART_PALETTE } from './chartPalette';
import type { Expense } from '../types/database';

export type DashboardRange = 'all' | 'current' | 'other';
export type DashboardPeriod = 'today' | 'week' | 'month';

export type CategoryStat = {
  category: string;
  amountYen: number;
  percentage: number;
  color: string;
  sourceCategories?: string[];
};

export type DailyStat = {
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

export type MemberPeriodStat = {
  userId: string;
  amountYen: number;
  percentage: number;
  color: string;
};

export type ComparisonStat = {
  previousTotalYen: number;
  deltaYen: number;
  percentage: number | null;
  direction: 'under' | 'over' | 'same';
  label: string;
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

export type MonthlyCategoryTrendStat = {
  monthKey: string;
  label: string;
  amountYen: number;
};

export type DashboardStats = {
  totalYen: number;
  count: number;
  categories: CategoryStat[];
  dailySeries: DailyStat[];
};

export type DashboardPeriodStats = DashboardStats & {
  dailyUserSeries: DailyUserStat[];
  comparison: ComparisonStat;
  dateRange: DashboardDateRange;
  memberTotals: MemberPeriodStat[];
};

export const DASHBOARD_CATEGORY_LIMIT = 5;
export const DASHBOARD_OTHER_CATEGORY_COLOR = '#98A2B3';

const CATEGORY_COLORS = CHART_PALETTE;
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
const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short'
});

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

export function toMonthKey(date: Date) {
  return [date.getFullYear(), padDatePart(date.getMonth() + 1)].join('-');
}

export function currentMonthKey() {
  return toMonthKey(new Date());
}

export function monthKeyFromDateString(dateString: string) {
  return dateString.slice(0, 7);
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

export function dashboardEndDateString(monthKey: string) {
  if (monthKey === currentMonthKey()) {
    return formatDateString(new Date());
  }

  return monthEndDateString(monthKey);
}

export function resolveDashboardDateRange(
  period: DashboardPeriod,
  monthKey: string,
  today: Date | string = new Date()
): DashboardDateRange {
  const todayDate = typeof today === 'string' ? parseDateString(today) : startOfDay(today);

  if (period === 'today') {
    return resolveTodayDateRange(todayDate);
  }

  if (period === 'week') {
    return resolveWeekDateRange(todayDate);
  }

  return resolveMonthDateRange(monthKey, todayDate);
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
    label: formatRangeLabel(todayString, todayString),
    comparisonLabel: `vs ${formatRangeLabel(yesterdayString, yesterdayString)}`
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
    comparisonLabel: `vs last ${formatWeekdayRangeLabel(comparisonStart, comparisonEnd)}`
  };
}

function resolveMonthDateRange(monthKey: string, todayDate: Date): DashboardDateRange {
  const currentKey = toMonthKey(todayDate);
  const todayString = formatDateString(todayDate);
  const effectiveMonthKey = monthKey;
  const selectedIsCurrentMonth = effectiveMonthKey === currentKey;
  const monthStartString = monthStartDateString(effectiveMonthKey);
  const monthEndString = selectedIsCurrentMonth ? todayString : monthEndDateString(effectiveMonthKey);
  const comparisonMonthKey = addMonths(effectiveMonthKey, -1);
  const comparisonStartString = monthStartDateString(comparisonMonthKey);
  const comparisonEndString = selectedIsCurrentMonth
    ? formatDateString(dateInMonthCapped(comparisonMonthKey, todayDate.getDate()))
    : monthEndDateString(comparisonMonthKey);

  return {
    period: 'month',
    effectiveMonthKey,
    startDateString: monthStartString,
    endDateString: monthEndString,
    comparisonStartDateString: comparisonStartString,
    comparisonEndDateString: comparisonEndString,
    label: selectedIsCurrentMonth ? formatRangeLabel(monthStartString, monthEndString) : formatMonthLabel(effectiveMonthKey),
    comparisonLabel: selectedIsCurrentMonth
      ? `vs ${formatRangeLabel(comparisonStartString, comparisonEndString)}`
      : `vs ${formatMonthLabel(comparisonMonthKey)}`
  };
}

export function buildDashboardPeriodStats(input: {
  expenses: Expense[];
  monthKey: string;
  period: DashboardPeriod;
  currentUserId: string | null;
  otherUserId: string | null;
  today?: Date | string;
}): DashboardPeriodStats {
  const dateRange = resolveDashboardDateRange(input.period, input.monthKey, input.today);
  const userIds = [input.currentUserId, input.otherUserId].filter((userId): userId is string => Boolean(userId));
  const periodExpenses = expensesInRange(input.expenses, dateRange.startDateString, dateRange.endDateString);
  const comparisonExpenses = expensesInRange(
    input.expenses,
    dateRange.comparisonStartDateString,
    dateRange.comparisonEndDateString
  );
  const totalYen = periodExpenses.reduce((sum, expense) => sum + expense.amount_yen, 0);
  const previousTotalYen = comparisonExpenses.reduce((sum, expense) => sum + expense.amount_yen, 0);
  const memberTotals = userIds.map((userId, index) => {
    const amountYen = periodExpenses.reduce((sum, expense) => sum + amountForUser(expense, userId), 0);
    return {
      userId,
      amountYen,
      percentage: totalYen > 0 ? (amountYen / totalYen) * 100 : 0,
      color: index === 0 ? CATEGORY_COLORS[0] : '#F97316'
    };
  });
  const dailyUserSeries = buildDashboardDailyUserSeries({
    expenses: periodExpenses,
    startDateString: dateRange.startDateString,
    endDateString: dateRange.endDateString,
    userIds
  });

  return {
    totalYen,
    count: periodExpenses.length,
    categories: buildDashboardCategoryStats({
      expenses: periodExpenses,
      totalYen
    }),
    dailySeries: buildDailySeries(dateRange.effectiveMonthKey, dateRange.endDateString, amountsByDate(periodExpenses)),
    dailyUserSeries,
    comparison: buildComparisonStat(totalYen, previousTotalYen, dateRange.comparisonLabel),
    dateRange,
    memberTotals
  };
}

export function buildDashboardStats(input: {
  expenses: Expense[];
  monthKey: string;
  endDateString: string;
  range: DashboardRange;
  currentUserId: string | null;
  otherUserId: string | null;
}): DashboardStats {
  const amountsByCategory = new Map<string, number>();
  const amountsByDate = new Map<string, number>();
  let totalYen = 0;
  let count = 0;

  for (const expense of input.expenses) {
    const amountYen = amountForRange(expense, input.range, input.currentUserId, input.otherUserId);
    if (amountYen <= 0) {
      continue;
    }

    totalYen += amountYen;
    count += 1;
    amountsByCategory.set(expense.category, (amountsByCategory.get(expense.category) || 0) + amountYen);
    amountsByDate.set(expense.spent_on, (amountsByDate.get(expense.spent_on) || 0) + amountYen);
  }

  const categories = [...amountsByCategory.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category, amountYen], index) => ({
      category,
      amountYen,
      percentage: totalYen > 0 ? (amountYen / totalYen) * 100 : 0,
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length]
    }));

  return {
    totalYen,
    count,
    categories,
    dailySeries: buildDailySeries(input.monthKey, input.endDateString, amountsByDate)
  };
}

export function buildCategoryMonthlyTrend(input: {
  expenses: Expense[];
  category: string;
  endMonthKey: string;
  months: number;
  range: DashboardRange;
  currentUserId: string | null;
  otherUserId: string | null;
}): MonthlyCategoryTrendStat[] {
  return buildCategoryMonthlyTrendForCategories({
    ...input,
    categories: [input.category]
  });
}

export function buildCategoryMonthlyTrendForCategories(input: {
  expenses: Expense[];
  categories: string[];
  endMonthKey: string;
  months: number;
  range: DashboardRange;
  currentUserId: string | null;
  otherUserId: string | null;
}): MonthlyCategoryTrendStat[] {
  const monthCount = Math.max(1, input.months);
  const monthKeys = Array.from({ length: monthCount }, (_, index) => (
    addMonths(input.endMonthKey, index - monthCount + 1)
  ));
  const amountsByMonth = new Map(monthKeys.map((monthKey) => [monthKey, 0]));
  const categorySet = new Set(input.categories);

  for (const expense of input.expenses) {
    if (!categorySet.has(expense.category)) {
      continue;
    }

    const monthKey = monthKeyFromDateString(expense.spent_on);
    if (!amountsByMonth.has(monthKey)) {
      continue;
    }

    const amountYen = amountForRange(expense, input.range, input.currentUserId, input.otherUserId);
    if (amountYen <= 0) {
      continue;
    }

    amountsByMonth.set(monthKey, (amountsByMonth.get(monthKey) || 0) + amountYen);
  }

  return monthKeys.map((monthKey) => ({
    monthKey,
    label: formatShortMonthLabel(monthKey),
    amountYen: amountsByMonth.get(monthKey) || 0
  }));
}

export function buildDashboardCategoryStats(input: {
  expenses: Expense[];
  totalYen: number;
}): CategoryStat[] {
  const amountsByCategory = new Map<string, number>();
  for (const expense of input.expenses) {
    amountsByCategory.set(expense.category, (amountsByCategory.get(expense.category) || 0) + expense.amount_yen);
  }

  const sortedCategories = [...amountsByCategory.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const otherEntry = sortedCategories.find(([category]) => category === 'Other');
  const sortedNamedCategories = sortedCategories.filter(([category]) => category !== 'Other');
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
          'Other',
          aggregateSources.reduce((sum, [, amountYen]) => sum + amountYen, 0)
        ] as [string, number]
      ]
    : sortedCategories;

  return visibleEntries.map(([category, amountYen], index) => {
    const sourceCategories = shouldAggregateOther && index === DASHBOARD_CATEGORY_LIMIT - 1
      ? aggregateSources.map(([sourceCategory]) => sourceCategory)
      : [category];
    return {
      category,
      amountYen,
      percentage: input.totalYen > 0 ? (amountYen / input.totalYen) * 100 : 0,
      color: index === DASHBOARD_CATEGORY_LIMIT - 1 && shouldAggregateOther
        ? DASHBOARD_OTHER_CATEGORY_COLOR
        : CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      sourceCategories
    };
  });
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
    expenses: input.expenses.filter((expense) => categorySet.has(expense.category)),
    startDateString: input.startDateString,
    endDateString: input.endDateString,
    userIds: input.userIds
  });
}

export function buildDashboardDailyUserSeries(input: {
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

export function amountForRange(
  expense: Expense,
  range: DashboardRange,
  currentUserId: string | null,
  otherUserId: string | null
) {
  if (range === 'all') {
    return expense.amount_yen;
  }

  const userId = range === 'current' ? currentUserId : otherUserId;
  if (!userId) {
    return 0;
  }

  return amountForUser(expense, userId);
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

function daysBetween(start: Date, end: Date) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / millisecondsPerDay);
}

function startOfWeekMonday(date: Date) {
  const day = date.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return addDays(startOfDay(date), -daysSinceMonday);
}

function dateInMonthCapped(monthKey: string, day: number) {
  const [year, month] = parseMonthKey(monthKey);
  const lastDay = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(day, lastDay));
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

function formatWeekdayRangeLabel(start: Date, end: Date) {
  if (formatDateString(start) === formatDateString(end)) {
    return weekdayFormatter.format(start);
  }

  return `${weekdayFormatter.format(start)}-${weekdayFormatter.format(end)}`;
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
