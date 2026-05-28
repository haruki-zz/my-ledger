import type { Expense } from '@/src/types/database';
import { CHART_PALETTE } from '@/src/lib/chartPalette';

export type DashboardRange = 'all' | 'current' | 'other';

export type CategoryStat = {
  category: string;
  amountYen: number;
  percentage: number;
  color: string;
};

export type DailyStat = {
  date: string;
  label: string;
  amountYen: number;
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

const CATEGORY_COLORS = CHART_PALETTE;

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
  const [year, month] = monthKey.split('-');
  return `${year}年${Number(month)}月`;
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
  const monthCount = Math.max(1, input.months);
  const monthKeys = Array.from({ length: monthCount }, (_, index) => (
    addMonths(input.endMonthKey, index - monthCount + 1)
  ));
  const amountsByMonth = new Map(monthKeys.map((monthKey) => [monthKey, 0]));

  for (const expense of input.expenses) {
    if (expense.category !== input.category) {
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
      label: String(day),
      amountYen: amountsByDate.get(date) || 0
    });
  }

  return series;
}

function monthStart(monthKey: string) {
  const [year, month] = parseMonthKey(monthKey);
  return new Date(year, month - 1, 1);
}

function parseMonthKey(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return [year, month] as const;
}

function formatShortMonthLabel(monthKey: string) {
  const [, month] = parseMonthKey(monthKey);
  return `${month}月`;
}

function formatDateString(date: Date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate())
  ].join('-');
}
