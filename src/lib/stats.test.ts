import { describe, expect, it } from 'vitest';

import {
  buildAmountComparison,
  buildDashboardHeatDays,
  buildDashboardDailyUserSeriesForCategories,
  buildDashboardPeriodStats,
  buildHistorySummary,
  buildMonthlyReceipts,
  closedMonthKeys,
  filterCurrentMonthSettledExpenses,
  heatLevelForAmount,
  heatScaleMaxForAmounts,
  resolveDashboardDateRange,
  resolveDashboardPeriodNavigation,
  trendAmountForVisualRatio,
  trendScaleMaxForAmounts,
  trendVisualRatioForAmount,
  type DashboardPeriod
} from './stats';
import { EXPENSE_CATEGORIES, iconNameForExpenseCategory } from './categories';
import { PRIMARY_CATEGORIES, mapLegacyCategoryToId, resolveCategory } from './categorySystem';
import { buildUserColorMap, colorForCategory, DEFAULT_USER_COLOR } from './entityColors';
import type { Expense, LedgerMemberProfile } from '@/src/types/database';

const CURRENT_USER_ID = 'user-a';
const OTHER_USER_ID = 'user-b';

describe('expense category icons', () => {
  it('has specific icons for default expense categories', () => {
    for (const category of EXPENSE_CATEGORIES) {
      if (category === 'Other') {
        expect(iconNameForExpenseCategory(category)).toBe('ellipsis-horizontal');
      } else {
        expect(iconNameForExpenseCategory(category)).not.toBe('ellipsis-horizontal');
      }
    }

    expect(iconNameForExpenseCategory('Communications')).toBe('chatbubbles-outline');
  });

  it('resolves common category icon edge cases', () => {
    expect(iconNameForExpenseCategory('FOOD')).toBe('restaurant-outline');
    expect(iconNameForExpenseCategory('food & dining')).toBe('restaurant-outline');
    expect(iconNameForExpenseCategory('Unknown Category')).toBe('ellipsis-horizontal');
  });
});

describe('primary category system', () => {
  it('defines unique, sorted primary category ids with display metadata', () => {
    const ids = PRIMARY_CATEGORIES.map((category) => category.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PRIMARY_CATEGORIES.map((category) => category.sortOrder)).toEqual(
      PRIMARY_CATEGORIES.map((category) => category.sortOrder).slice().sort((a, b) => a - b)
    );
    for (const category of PRIMARY_CATEGORIES) {
      expect(category.label).toBeTruthy();
      expect(category.icon).toBeTruthy();
      expect(category.color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('maps legacy English and Chinese categories to stable primary ids', () => {
    expect(mapLegacyCategoryToId('Rent')).toBe('housing');
    expect(mapLegacyCategoryToId('房租')).toBe('housing');
    expect(mapLegacyCategoryToId('Food & Dining')).toBe('food_dining');
    expect(mapLegacyCategoryToId('餐饮')).toBe('food_dining');
    expect(mapLegacyCategoryToId('Shopping')).toBe('shopping');
    expect(mapLegacyCategoryToId('购物')).toBe('shopping');
  });

  it('preserves renamed and unknown legacy categories as subcategory text', () => {
    expect(resolveCategory({ category: 'Rent' })).toMatchObject({
      categoryId: 'housing',
      subcategory: 'Rent'
    });
    expect(resolveCategory({ category: 'Pet Supplies' })).toMatchObject({
      categoryId: 'other',
      subcategory: 'Pet Supplies'
    });
  });

  it('places beauty, hobby, and sports as primary category subcategory presets', () => {
    const foodDining = PRIMARY_CATEGORIES.find((category) => category.id === 'food_dining');
    const entertainment = PRIMARY_CATEGORIES.find((category) => category.id === 'entertainment');
    const shopping = PRIMARY_CATEGORIES.find((category) => category.id === 'shopping');

    expect(foodDining?.subcategories).toContain('Convenience');
    expect(entertainment?.subcategories).toEqual(expect.arrayContaining(['Hobby', 'Sports']));
    expect(shopping?.subcategories).toContain('Beauty & Salon');
  });
});

describe('entity colors', () => {
  it('uses the same category color in dashboard stats and shared category helpers', () => {
    const stats = buildStats('month', [
      expense({ amountYen: 1000, category: 'Shopping', spentOn: '2026-06-01' }),
      expense({ amountYen: 500, category: 'Rent', spentOn: '2026-06-01' })
    ]);

    expect(stats.categories.find((category) => category.category === 'Shopping')?.color).toBe(colorForCategory('Shopping'));
    expect(colorForCategory('shopping')).toBe(colorForCategory('Shopping'));
  });

  it('assigns stable colors for current user and other ledger members', () => {
    const colorsById = buildUserColorMap([OTHER_USER_ID, CURRENT_USER_ID, 'user-c'], CURRENT_USER_ID);

    expect(DEFAULT_USER_COLOR).toBe('#B25A3C');
    expect(colorsById.get(CURRENT_USER_ID)).toBe('#B25A3C');
    expect(colorsById.get(OTHER_USER_ID)).toBe('#3F8A86');
    expect(colorsById.get(OTHER_USER_ID)).not.toBe(colorsById.get('user-c'));
  });

  it('keeps user colors separate from fixed category colors', () => {
    const categoryColors = new Set<string>(PRIMARY_CATEGORIES.map((category) => category.color));
    const colorsById = buildUserColorMap(
      [CURRENT_USER_ID, ...Array.from({ length: 12 }, (_, index) => `user-${index}`)],
      CURRENT_USER_ID
    );

    expect(categoryColors.has('#B25A3C')).toBe(false);
    expect(categoryColors.has('#3F8A86')).toBe(false);
    for (const userColor of colorsById.values()) {
      expect(categoryColors.has(userColor)).toBe(false);
    }
  });
});

describe('resolveDashboardDateRange', () => {
  it('resolves today with yesterday comparison', () => {
    expect(resolveDashboardDateRange('today', '2026-05', '2026-06-03')).toMatchObject({
      effectiveMonthKey: '2026-06',
      startDateString: '2026-06-03',
      endDateString: '2026-06-03',
      comparisonStartDateString: '2026-06-02',
      comparisonEndDateString: '2026-06-02'
    });
  });

  it('resolves week from Monday through today with the same slice last week', () => {
    expect(resolveDashboardDateRange('week', '2026-05', '2026-06-03')).toMatchObject({
      effectiveMonthKey: '2026-06',
      startDateString: '2026-06-01',
      endDateString: '2026-06-03',
      comparisonStartDateString: '2026-05-25',
      comparisonEndDateString: '2026-05-27',
      comparisonLabel: 'vs last week'
    });
  });

  it('resolves Monday week as one day of data', () => {
    expect(resolveDashboardDateRange('week', '2026-05', '2026-06-01')).toMatchObject({
      startDateString: '2026-06-01',
      endDateString: '2026-06-01',
      comparisonStartDateString: '2026-05-25',
      comparisonEndDateString: '2026-05-25',
      comparisonLabel: 'vs last week'
    });
  });

  it('uses month-to-date for current month totals and same-progress previous month comparison', () => {
    expect(resolveDashboardDateRange('month', '2026-06', '2026-06-03')).toMatchObject({
      startDateString: '2026-06-01',
      endDateString: '2026-06-03',
      comparisonStartDateString: '2026-05-01',
      comparisonEndDateString: '2026-05-03',
      comparisonLabel: 'vs May'
    });
  });

  it('caps same-progress month comparison when the previous month is shorter', () => {
    expect(resolveDashboardDateRange('month', '2026-03', '2026-03-31')).toMatchObject({
      startDateString: '2026-03-01',
      endDateString: '2026-03-31',
      comparisonStartDateString: '2026-02-01',
      comparisonEndDateString: '2026-02-28',
      comparisonLabel: 'vs Feb'
    });
  });

  it('uses full months for historical month comparison', () => {
    expect(resolveDashboardDateRange('month', '2026-04', '2026-06-03')).toMatchObject({
      startDateString: '2026-04-01',
      endDateString: '2026-04-30',
      comparisonStartDateString: '2026-03-01',
      comparisonEndDateString: '2026-03-31'
    });
  });

  it('applies period offsets by day, week, and month', () => {
    expect(resolveDashboardDateRange('today', '2026-06', '2026-06-03', -1)).toMatchObject({
      startDateString: '2026-06-02',
      endDateString: '2026-06-02',
      comparisonStartDateString: '2026-06-01'
    });
    expect(resolveDashboardDateRange('week', '2026-06', '2026-06-17', -1)).toMatchObject({
      startDateString: '2026-06-08',
      endDateString: '2026-06-10',
      comparisonStartDateString: '2026-06-01',
      comparisonEndDateString: '2026-06-03'
    });
    expect(resolveDashboardDateRange('month', '2026-06', '2026-06-17', -1)).toMatchObject({
      startDateString: '2026-05-01',
      endDateString: '2026-05-31',
      comparisonStartDateString: '2026-04-01'
    });
  });

  it('disables future dashboard navigation at the current period', () => {
    expect(resolveDashboardPeriodNavigation({
      minimumMonthKey: '2026-01',
      monthKey: '2026-06',
      offset: 0,
      period: 'week',
      today: '2026-06-17'
    })).toMatchObject({
      canGoNext: false,
      canGoPrevious: true
    });
    expect(resolveDashboardPeriodNavigation({
      minimumMonthKey: '2026-01',
      monthKey: '2026-06',
      offset: -1,
      period: 'week',
      today: '2026-06-17'
    })).toMatchObject({
      canGoNext: true
    });
  });
});

describe('buildDashboardPeriodStats', () => {
  it('formats amount comparison edge cases for category detail badges', () => {
    expect(buildAmountComparison(0, 0)).toMatchObject({ direction: 'same', label: '—', percentage: null });
    expect(buildAmountComparison(500, 0)).toMatchObject({ direction: 'new', label: 'NEW', percentage: null });
    expect(buildAmountComparison(1500, 1000)).toMatchObject({ direction: 'over', label: '+50%', percentage: 50 });
    expect(buildAmountComparison(500, 1000)).toMatchObject({ direction: 'under', label: '−50%', percentage: -50 });
  });

  it('attributes shared splits and personal expenses to users', () => {
    const stats = buildStats('month', [
      expense({ amountYen: 1000, category: 'Food & Dining', spentOn: '2026-06-01', splits: [600, 400] }),
      expense({ amountYen: 500, category: 'Transport', ownership: 'personal', paidBy: CURRENT_USER_ID, spentOn: '2026-06-02' })
    ]);

    expect(stats.totalYen).toBe(1500);
    expect(stats.memberTotals).toEqual([
      expect.objectContaining({ amountYen: 1100, percentage: expect.closeTo(73.333, 2), userId: CURRENT_USER_ID }),
      expect.objectContaining({ amountYen: 400, percentage: expect.closeTo(26.666, 2), userId: OTHER_USER_ID })
    ]);
    expect(stats.dailyUserSeries[0].amountsByUserId).toMatchObject({
      [CURRENT_USER_ID]: 600,
      [OTHER_USER_ID]: 400
    });
    expect(stats.dailyUserSeries[1].amountsByUserId).toMatchObject({
      [CURRENT_USER_ID]: 500,
      [OTHER_USER_ID]: 0
    });
  });

  it('handles single-user ledgers without a partner summary', () => {
    const stats = buildDashboardPeriodStats({
      expenses: [expense({ amountYen: 700, category: 'Utilities', ownership: 'personal', paidBy: CURRENT_USER_ID, spentOn: '2026-06-02' })],
      monthKey: '2026-06',
      period: 'month',
      currentUserId: CURRENT_USER_ID,
      otherUserId: null,
      today: '2026-06-03'
    });

    expect(stats.memberTotals).toHaveLength(1);
    expect(stats.memberTotals[0]).toMatchObject({ amountYen: 700, userId: CURRENT_USER_ID });
  });

  it('builds previous-period comparison', () => {
    const stats = buildStats('today', [
      expense({ amountYen: 300, category: 'Food & Dining', spentOn: '2026-06-03' }),
      expense({ amountYen: 500, category: 'Food & Dining', spentOn: '2026-06-02' })
    ]);

    expect(stats.totalYen).toBe(300);
    expect(stats.comparison).toMatchObject({
      previousTotalYen: 500,
      deltaYen: -200,
      direction: 'under',
      percentage: -40
    });
  });

  it('compares current month spend against the same progress in the previous month', () => {
    const stats = buildDashboardPeriodStats({
      expenses: [
        expense({ amountYen: 1000, category: 'Food & Dining', spentOn: '2026-07-01' }),
        expense({ amountYen: 500, category: 'Transport', spentOn: '2026-07-02' }),
        expense({ amountYen: 3000, category: 'Food & Dining', spentOn: '2026-06-01' }),
        expense({ amountYen: 2000, category: 'Transport', spentOn: '2026-06-02' }),
        expense({ amountYen: 120000, category: 'Rent', spentOn: '2026-06-15' })
      ],
      monthKey: '2026-07',
      period: 'month',
      currentUserId: CURRENT_USER_ID,
      otherUserId: OTHER_USER_ID,
      today: '2026-07-02'
    });

    expect(stats.totalYen).toBe(1500);
    expect(stats.comparison).toMatchObject({
      previousTotalYen: 5000,
      deltaYen: -3500,
      direction: 'under',
      label: 'vs Jun',
      percentage: -70
    });
  });

  it('excludes current-month fixed expenses generated after today from settled dashboard stats', () => {
    const expenses = filterCurrentMonthSettledExpenses({
      expenses: [
        expense({ amountYen: 1200, category: 'Utilities', recurringRuleId: 'rule-utilities', recurringMonth: '2026-06-01', spentOn: '2026-06-20' })
      ],
      recurringRules: [{ id: 'rule-utilities', is_active: true }],
      today: '2026-06-03'
    });
    const stats = buildStats('month', expenses);

    expect(stats.totalYen).toBe(0);
    expect(stats.dailyUserSeries).toHaveLength(3);
    expect(stats.dailyUserSeries.map((day) => day.totalAmountYen)).toEqual([0, 0, 0]);
  });

  it('aggregates category rows as top five plus Other', () => {
    const stats = buildStats('month', [
      expense({ amountYen: 700, category: 'Housing', spentOn: '2026-06-01' }),
      expense({ amountYen: 600, category: 'Food & Dining', spentOn: '2026-06-01' }),
      expense({ amountYen: 500, category: 'Transport', spentOn: '2026-06-01' }),
      expense({ amountYen: 400, category: 'Utilities', spentOn: '2026-06-01' }),
      expense({ amountYen: 300, category: 'Shopping', spentOn: '2026-06-01' }),
      expense({ amountYen: 200, category: 'Travel', spentOn: '2026-06-01' }),
      expense({ amountYen: 100, category: 'Healthcare', spentOn: '2026-06-01' })
    ]);

    expect(stats.categories.map((category) => category.category)).toEqual([
      'Housing',
      'Food & Dining',
      'Transport',
      'Utilities',
      'Shopping',
      'Other'
    ]);
    expect(stats.categories[5]).toMatchObject({
      amountYen: 300,
      percentage: expect.closeTo(10.714, 2),
      sourceCategories: ['travel', 'healthcare']
    });
  });

  it('keeps daily series scoped to aggregated Other source categories', () => {
    const expenses = [
      expense({ amountYen: 700, category: 'Housing', spentOn: '2026-06-01' }),
      expense({ amountYen: 600, category: 'Food & Dining', spentOn: '2026-06-01' }),
      expense({ amountYen: 500, category: 'Transport', spentOn: '2026-06-01' }),
      expense({ amountYen: 400, category: 'Utilities', spentOn: '2026-06-01' }),
      expense({ amountYen: 300, category: 'Shopping', spentOn: '2026-06-01' }),
      expense({ amountYen: 200, category: 'Travel', spentOn: '2026-06-02' }),
      expense({ amountYen: 100, category: 'Healthcare', spentOn: '2026-06-03' })
    ];
    const stats = buildStats('month', expenses);
    const other = stats.categories.find((category) => category.category === 'Other');
    const series = buildDashboardDailyUserSeriesForCategories({
      expenses,
      categories: other?.sourceCategories || [],
      startDateString: stats.dateRange.startDateString,
      endDateString: stats.dateRange.endDateString,
      userIds: [CURRENT_USER_ID, OTHER_USER_ID]
    });

    expect(series).toHaveLength(3);
    expect(series.slice(0, 3).map((day) => day.totalAmountYen)).toEqual([0, 200, 100]);
  });

  it('builds category detail stats that reconcile with the donut row', () => {
    const stats = buildStats('month', [
      expense({ amountYen: 900, category: 'Food & Dining', spentOn: '2026-06-01', subcategory: 'Groceries' }),
      expense({ amountYen: 300, category: 'Food & Dining', spentOn: '2026-06-03', subcategory: 'Restaurant' }),
      expense({ amountYen: 800, category: 'Transport', spentOn: '2026-06-02' }),
      expense({ amountYen: 600, category: 'Food & Dining', spentOn: '2026-05-02' })
    ]);
    const foodRow = stats.categories.find((category) => category.category === 'Food & Dining');
    const foodDetail = stats.categoryDetails.find((detail) => detail.detailKey === foodRow?.detailKey);

    expect(foodRow).toMatchObject({ amountYen: 1200, detailKey: 'food_dining' });
    expect(foodDetail).toMatchObject({
      amountYen: 1200,
      averagePerDayYen: 400,
      breakdownKind: 'subcategory',
      shareOfTotal: 60,
      transactions: 2
    });
    expect(foodDetail?.comparison).toMatchObject({ direction: 'over', label: '+100%', previousAmountYen: 600 });
    expect(foodDetail?.daily.slice(0, 3).map((day) => day.amountYen)).toEqual([900, 0, 300]);
    expect(foodDetail?.topDay).toMatchObject({ amountYen: 900, date: '2026-06-01' });
  });

  it('uses resolved legacy category text in subcategory details', () => {
    const stats = buildStats('month', [
      expense({ amountYen: 1000, category: 'Rent', categoryId: null, spentOn: '2026-06-01' }),
      expense({ amountYen: 400, category: 'Pet Supplies', categoryId: null, spentOn: '2026-06-02' })
    ]);
    const housing = stats.categoryDetails.find((detail) => detail.detailKey === 'housing');
    const other = stats.categoryDetails.find((detail) => detail.detailKey === 'other');

    expect(housing?.breakdown).toEqual([
      expect.objectContaining({ amountYen: 1000, label: 'Rent' })
    ]);
    expect(other?.breakdown).toEqual([
      expect.objectContaining({ amountYen: 400, label: 'Pet Supplies' })
    ]);
  });

  it('uses a by-category breakdown for aggregated Other details', () => {
    const stats = buildStats('month', [
      expense({ amountYen: 700, category: 'Housing', spentOn: '2026-06-01' }),
      expense({ amountYen: 600, category: 'Food & Dining', spentOn: '2026-06-01' }),
      expense({ amountYen: 500, category: 'Transport', spentOn: '2026-06-01' }),
      expense({ amountYen: 400, category: 'Utilities', spentOn: '2026-06-01' }),
      expense({ amountYen: 300, category: 'Shopping', spentOn: '2026-06-01' }),
      expense({ amountYen: 200, category: 'Travel', spentOn: '2026-06-02' }),
      expense({ amountYen: 100, category: 'Healthcare', spentOn: '2026-06-03' }),
      expense({ amountYen: 150, category: 'Travel', spentOn: '2026-05-03' })
    ]);
    const otherRow = stats.categories.find((category) => category.category === 'Other');
    const otherDetail = stats.categoryDetails.find((detail) => detail.detailKey === otherRow?.detailKey);

    expect(otherRow).toMatchObject({
      amountYen: 300,
      sourceCategories: ['travel', 'healthcare']
    });
    expect(otherDetail).toMatchObject({
      breakdownKind: 'category',
      sourceCategories: ['travel', 'healthcare']
    });
    expect(otherDetail?.breakdown.map((item) => [item.label, item.amountYen])).toEqual([
      ['Travel', 200],
      ['Healthcare', 100]
    ]);
    expect(otherDetail?.comparison).toMatchObject({ direction: 'over', label: '+100%', previousAmountYen: 150 });
  });

  it('builds single-user category split details', () => {
    const stats = buildDashboardPeriodStats({
      expenses: [
        expense({ amountYen: 700, category: 'Utilities', ownership: 'personal', paidBy: CURRENT_USER_ID, spentOn: '2026-06-02' })
      ],
      monthKey: '2026-06',
      period: 'month',
      currentUserId: CURRENT_USER_ID,
      otherUserId: null,
      today: '2026-06-03'
    });
    const detail = stats.categoryDetails.find((category) => category.detailKey === 'utilities');

    expect(detail?.memberSplits).toEqual([
      expect.objectContaining({ amountYen: 700, percentage: 100, userId: CURRENT_USER_ID })
    ]);
  });

  it('merges an existing Other category into the aggregated Other row', () => {
    const stats = buildStats('month', [
      expense({ amountYen: 700, category: 'Housing', spentOn: '2026-06-01' }),
      expense({ amountYen: 600, category: 'Food & Dining', spentOn: '2026-06-01' }),
      expense({ amountYen: 500, category: 'Transport', spentOn: '2026-06-01' }),
      expense({ amountYen: 400, category: 'Utilities', spentOn: '2026-06-01' }),
      expense({ amountYen: 300, category: 'Shopping', spentOn: '2026-06-02' }),
      expense({ amountYen: 250, category: 'Other', spentOn: '2026-06-02' }),
      expense({ amountYen: 200, category: 'Travel', spentOn: '2026-06-03' }),
      expense({ amountYen: 100, category: 'Healthcare', spentOn: '2026-06-03' })
    ]);

    expect(stats.categories.map((category) => category.category)).toEqual([
      'Housing',
      'Food & Dining',
      'Transport',
      'Utilities',
      'Shopping',
      'Other'
    ]);
    expect(stats.categories[5]).toMatchObject({
      amountYen: 550,
      sourceCategories: ['travel', 'healthcare', 'other']
    });
  });

  it('keeps a real Other category at the bottom when it is not aggregated', () => {
    const stats = buildStats('month', [
      expense({ amountYen: 1000, category: 'Other', spentOn: '2026-06-01' }),
      expense({ amountYen: 300, category: 'Food & Dining', spentOn: '2026-06-01' }),
      expense({ amountYen: 200, category: 'Transport', spentOn: '2026-06-01' })
    ]);

    expect(stats.categories.map((category) => category.category)).toEqual([
      'Food & Dining',
      'Transport',
      'Other'
    ]);
  });
});

describe('viewer-scoped dashboard stats', () => {
  it('scopes totals, categories, and comparison to the viewer\'s attributed share', () => {
    const stats = buildDashboardPeriodStats({
      expenses: [
        expense({ amountYen: 1000, category: 'Food & Dining', spentOn: '2026-06-01', splits: [600, 400] }),
        expense({ amountYen: 500, category: 'Transport', ownership: 'personal', paidBy: OTHER_USER_ID, spentOn: '2026-06-02' }),
        expense({ amountYen: 400, category: 'Food & Dining', spentOn: '2026-05-01', splits: [240, 160] })
      ],
      monthKey: '2026-06',
      period: 'month',
      currentUserId: CURRENT_USER_ID,
      otherUserId: OTHER_USER_ID,
      today: '2026-06-03',
      viewerUserId: CURRENT_USER_ID
    });

    expect(stats.totalYen).toBe(600);
    expect(stats.count).toBe(1);
    expect(stats.categories).toEqual([
      expect.objectContaining({ amountYen: 600, category: 'Food & Dining' })
    ]);
    expect(stats.comparison).toMatchObject({ previousTotalYen: 240, deltaYen: 360 });
    expect(stats.memberTotals).toEqual([
      expect.objectContaining({ amountYen: 600, userId: CURRENT_USER_ID }),
      expect.objectContaining({ amountYen: 900, userId: OTHER_USER_ID })
    ]);
  });

  it('hides member splits on category details when scoped to a single viewer', () => {
    const stats = buildDashboardPeriodStats({
      expenses: [
        expense({ amountYen: 1000, category: 'Food & Dining', spentOn: '2026-06-01', splits: [600, 400] })
      ],
      monthKey: '2026-06',
      period: 'month',
      currentUserId: CURRENT_USER_ID,
      otherUserId: OTHER_USER_ID,
      today: '2026-06-03',
      viewerUserId: CURRENT_USER_ID
    });
    const detail = stats.categoryDetails.find((category) => category.detailKey === 'food_dining');

    expect(detail?.amountYen).toBe(600);
    expect(detail?.memberSplits).toEqual([]);
  });

  it('falls back to combined totals when no viewer is given', () => {
    const stats = buildStats('month', [
      expense({ amountYen: 1000, category: 'Food & Dining', spentOn: '2026-06-01', splits: [600, 400] })
    ]);

    expect(stats.totalYen).toBe(1000);
    expect(stats.categoryDetails[0].memberSplits).toHaveLength(2);
  });
});

describe('buildHistorySummary', () => {
  it('builds count-led current-month summary stats from filtered records', () => {
    const summary = buildHistorySummary({
      activeFilterCount: 2,
      expenses: [
        { displayAmountYen: 1000, expense: expense({ amountYen: 1000, category: 'Food & Dining', spentOn: '2026-06-01' }) },
        { displayAmountYen: 500, expense: expense({ amountYen: 500, category: 'Transport', spentOn: '2026-06-01' }) },
        { displayAmountYen: 2000, expense: expense({ amountYen: 2000, category: 'Food & Dining', spentOn: '2026-06-02' }) }
      ],
      monthKey: '2026-06',
      today: '2026-06-04'
    });

    expect(summary).toMatchObject({
      activeFilterCount: 2,
      averagePerDayYen: 875,
      count: 3,
      totalYen: 3500
    });
    expect(summary.peakDay).toMatchObject({ amountYen: 2000, date: '2026-06-02' });
    expect(summary.categoryMix.map((category) => category.categoryId)).toEqual(['food_dining', 'transport']);
    expect(summary.topCategoryCaption).toBe('Food & Dining · 86% top category');
  });
});

describe('monthly receipts', () => {
  it('enumerates closed months but excludes zero-record and zero-spend receipts', () => {
    expect(closedMonthKeys({ startMonthKey: '2026-03', endBeforeMonthKey: '2026-06' })).toEqual([
      '2026-05',
      '2026-04',
      '2026-03'
    ]);

    const receipts = buildMonthlyReceipts({
      currentUserId: CURRENT_USER_ID,
      endBeforeMonthKey: '2026-06',
      expenses: [
        expense({ amountYen: 1000, category: 'Food & Dining', spentOn: '2026-03-10' }),
        expense({ amountYen: 0, category: 'Food & Dining', spentOn: '2026-04-10' }),
        expense({ amountYen: 2000, category: 'Food & Dining', spentOn: '2026-05-10' })
      ],
      otherUserId: OTHER_USER_ID,
      startMonthKey: '2026-03'
    });

    expect(receipts.map((receipt) => receipt.monthKey)).toEqual(['2026-05', '2026-03']);
  });

  it('builds receipt MoM states, active categories, daily average, and split totals', () => {
    const receipts = buildMonthlyReceipts({
      currentUserId: CURRENT_USER_ID,
      endBeforeMonthKey: '2026-06',
      expenses: [
        expense({ amountYen: 1000, category: 'Food & Dining', spentOn: '2026-04-10', splits: [700, 300] }),
        expense({ amountYen: 400, category: 'Transport', spentOn: '2026-04-11', splits: [200, 200] }),
        expense({ amountYen: 2000, category: 'Food & Dining', spentOn: '2026-05-10', splits: [1400, 600] }),
        expense({ amountYen: 300, category: 'Shopping', spentOn: '2026-05-12', splits: [100, 200] })
      ],
      otherUserId: OTHER_USER_ID,
      startMonthKey: '2026-04'
    });
    const may = receipts[0];
    const food = may.lines.find((line) => line.categoryId === 'food_dining');
    const transport = may.lines.find((line) => line.categoryId === 'transport');
    const shopping = may.lines.find((line) => line.categoryId === 'shopping');
    const housing = may.lines.find((line) => line.categoryId === 'housing');

    expect(may).toMatchObject({
      activeCategoryCount: 2,
      alexAmountYen: 1500,
      dailyAverageYen: 74,
      minaAmountYen: 800,
      records: 2,
      totalYen: 2300
    });
    expect(food).toMatchObject({ momDirection: 'up', momLabel: '+100%' });
    expect(transport).toMatchObject({ momDirection: 'down', momLabel: '−100%' });
    expect(shopping).toMatchObject({ momDirection: 'new', momLabel: 'NEW' });
    expect(housing).toMatchObject({ momDirection: 'flat', momLabel: '—' });
  });
});

describe('buildDashboardHeatDays', () => {
  it('builds one natural month and ignores comparison-month expenses', () => {
    const days = buildHeatDays([
      expense({ amountYen: 900, category: 'Food & Dining', spentOn: '2026-05-31' }),
      expense({ amountYen: 1200, category: 'Food & Dining', spentOn: '2026-06-01' })
    ]);

    expect(days).toHaveLength(30);
    expect(days[0]).toMatchObject({
      amount: 1200,
      count: 1,
      date: '2026-06-01'
    });
    expect(days.every((day) => day.date.startsWith('2026-06-'))).toBe(true);
  });

  it('sorts and colors top categories for each day', () => {
    const days = buildHeatDays([
      expense({ amountYen: 500, category: 'Transport', spentOn: '2026-06-02' }),
      expense({ amountYen: 900, category: 'Food & Dining', spentOn: '2026-06-02' }),
      expense({ amountYen: 200, category: 'Shopping', spentOn: '2026-06-02' })
    ]);

    expect(days[1].byCategory).toEqual([
      expect.objectContaining({ amount: 900, color: '#CB5F43', id: 'food_dining', label: 'Food & Dining' }),
      expect.objectContaining({ amount: 500, color: '#4F77BE', id: 'transport', label: 'Transport' }),
      expect.objectContaining({ amount: 200, color: '#C9628F', id: 'shopping', label: 'Shopping' })
    ]);
  });

  it('aggregates member splits with the dashboard attribution rules', () => {
    const days = buildHeatDays([
      expense({ amountYen: 1000, category: 'Food & Dining', spentOn: '2026-06-03', splits: [650, 350] }),
      expense({ amountYen: 700, category: 'Transport', ownership: 'personal', paidBy: OTHER_USER_ID, spentOn: '2026-06-03' })
    ]);

    expect(days[2].byMember).toEqual([
      expect.objectContaining({ amount: 650, color: '#B25A3C', id: CURRENT_USER_ID, label: 'Alex' }),
      expect.objectContaining({ amount: 1050, color: '#3F8A86', id: OTHER_USER_ID, label: 'Mina' })
    ]);
  });

  it('keeps zero-spend days and excludes current-month future expenses', () => {
    const days = buildHeatDays([
      expense({ amountYen: 1200, category: 'Food & Dining', spentOn: '2026-06-10' })
    ], { today: '2026-06-03' });

    expect(days[8]).toMatchObject({
      amount: 0,
      count: 0,
      date: '2026-06-09'
    });
    expect(days[9]).toMatchObject({
      amount: 0,
      count: 0,
      date: '2026-06-10'
    });
  });

  it('does not treat historical month dates after same-numbered today as future', () => {
    const days = buildHeatDays([
      expense({ amountYen: 1200, category: 'Food & Dining', spentOn: '2026-05-10' })
    ], { monthKey: '2026-05', today: '2026-06-03' });

    expect(days[9]).toMatchObject({
      amount: 1200,
      count: 1,
      date: '2026-05-10'
    });
  });

  it('scopes day amounts to the viewer and drops expenses they have no stake in', () => {
    const days = buildDashboardHeatDays({
      expenses: [
        expense({ amountYen: 1000, category: 'Food & Dining', spentOn: '2026-06-03', splits: [650, 350] }),
        expense({ amountYen: 700, category: 'Transport', ownership: 'personal', paidBy: OTHER_USER_ID, spentOn: '2026-06-03' })
      ],
      monthKey: '2026-06',
      members: ledgerMembers(),
      currentUserId: CURRENT_USER_ID,
      today: '2026-06-20',
      viewerUserId: CURRENT_USER_ID
    });

    expect(days[2]).toMatchObject({ amount: 650, count: 1, date: '2026-06-03' });
    expect(days[2].byMember).toEqual([]);
  });
});

describe('heatLevelForAmount', () => {
  it('assigns zero and relative spend into four positive levels', () => {
    expect(heatLevelForAmount(0, 1000)).toBe(0);
    expect(heatLevelForAmount(1, 1000)).toBe(1);
    expect(heatLevelForAmount(250, 1000)).toBe(1);
    expect(heatLevelForAmount(251, 1000)).toBe(2);
    expect(heatLevelForAmount(750, 1000)).toBe(3);
    expect(heatLevelForAmount(1000, 1000)).toBe(4);
  });

  it('supports a five-level active heat scale', () => {
    expect(heatLevelForAmount(200, 1000, 5)).toBe(1);
    expect(heatLevelForAmount(201, 1000, 5)).toBe(2);
    expect(heatLevelForAmount(600, 1000, 5)).toBe(3);
    expect(heatLevelForAmount(1000, 1000, 5)).toBe(5);
  });
});

describe('heatScaleMaxForAmounts', () => {
  it('caps heat scale with a high percentile so one outlier does not flatten the month', () => {
    const scaleMax = heatScaleMaxForAmounts([0, 3000, 8000, 12000, 18000, 200000]);

    expect(scaleMax).toBe(18000);
    expect(heatLevelForAmount(3000, scaleMax, 5)).toBe(1);
    expect(heatLevelForAmount(8000, scaleMax, 5)).toBe(3);
    expect(heatLevelForAmount(12000, scaleMax, 5)).toBe(4);
    expect(heatLevelForAmount(18000, scaleMax, 5)).toBe(5);
    expect(heatLevelForAmount(200000, scaleMax, 5)).toBe(5);
  });

  it('uses the next highest day as the scale max for tiny samples with a large outlier', () => {
    expect(heatScaleMaxForAmounts([5000, 9000, 100000])).toBe(9000);
  });
});

describe('daily trend visual scaling', () => {
  it('caps the visual scale so one large day does not flatten ordinary days', () => {
    const scaleMax = trendScaleMaxForAmounts([0, 3000, 8000, 12000, 18000, 360000]);

    expect(scaleMax).toBe(18000);
    expect(trendVisualRatioForAmount(3000, scaleMax)).toBeGreaterThan(0.25);
    expect(trendVisualRatioForAmount(8000, scaleMax)).toBeGreaterThan(0.55);
    expect(trendVisualRatioForAmount(360000, scaleMax)).toBe(1);
  });

  it('can derive axis labels from the non-linear visual ratio', () => {
    const scaleMax = 18000;
    const midAmount = trendAmountForVisualRatio(0.5, scaleMax);

    expect(midAmount).toBeGreaterThan(6000);
    expect(midAmount).toBeLessThan(7000);
  });
});

describe('filterCurrentMonthSettledExpenses', () => {
  it('keeps current-month active fixed expenses on the pay day boundary', () => {
    const expenses = [
      expense({ amountYen: 1200, category: 'Utilities', recurringRuleId: 'rule-utilities', recurringMonth: '2026-06-01', spentOn: '2026-06-01' })
    ];

    expect(filterCurrentMonthSettledExpenses({
      expenses,
      recurringRules: [{ id: 'rule-utilities', is_active: true }],
      today: '2026-06-01'
    })).toEqual(expenses);
  });

  it('keeps current-month active fixed expenses before today', () => {
    const expenses = [
      expense({ amountYen: 1200, category: 'Utilities', recurringRuleId: 'rule-utilities', recurringMonth: '2026-06-01', spentOn: '2026-06-02' })
    ];

    expect(filterCurrentMonthSettledExpenses({
      expenses,
      recurringRules: [{ id: 'rule-utilities', is_active: true }],
      today: '2026-06-03'
    })).toEqual(expenses);
  });

  it('excludes current-month active fixed expenses after today', () => {
    const expenses = [
      expense({ amountYen: 1200, category: 'Utilities', recurringRuleId: 'rule-utilities', recurringMonth: '2026-06-01', spentOn: '2026-06-20' })
    ];

    expect(filterCurrentMonthSettledExpenses({
      expenses,
      recurringRules: [{ id: 'rule-utilities', is_active: true }],
      today: '2026-06-03'
    })).toEqual([]);
  });

  it('excludes current-month inactive fixed expenses', () => {
    const expenses = [
      expense({ amountYen: 1200, category: 'Utilities', recurringRuleId: 'rule-utilities', recurringMonth: '2026-06-01', spentOn: '2026-06-02' })
    ];

    expect(filterCurrentMonthSettledExpenses({
      expenses,
      recurringRules: [{ id: 'rule-utilities', is_active: false }],
      today: '2026-06-03'
    })).toEqual([]);
  });

  it('keeps previous-month fixed expenses even when the current rule is inactive', () => {
    const expenses = [
      expense({ amountYen: 1200, category: 'Utilities', recurringRuleId: 'rule-utilities', recurringMonth: '2026-05-01', spentOn: '2026-05-20' })
    ];

    expect(filterCurrentMonthSettledExpenses({
      expenses,
      recurringRules: [{ id: 'rule-utilities', is_active: false }],
      today: '2026-06-03'
    })).toEqual(expenses);
  });

  it('keeps recurring expenses whose rule no longer exists', () => {
    const expenses = [
      expense({ amountYen: 1200, category: 'Utilities', recurringRuleId: 'deleted-rule', recurringMonth: '2026-06-01', spentOn: '2026-06-02' })
    ];

    expect(filterCurrentMonthSettledExpenses({
      expenses,
      recurringRules: [],
      today: '2026-06-03'
    })).toEqual(expenses);
  });

  it('keeps ordinary expenses regardless of fixed expense rule state', () => {
    const expenses = [
      expense({ amountYen: 1200, category: 'Utilities', spentOn: '2026-06-20' })
    ];

    expect(filterCurrentMonthSettledExpenses({
      expenses,
      recurringRules: [{ id: 'rule-utilities', is_active: false }],
      today: '2026-06-03'
    })).toEqual(expenses);
  });
});

function buildStats(period: DashboardPeriod, expenses: Expense[]) {
  return buildDashboardPeriodStats({
    expenses,
    monthKey: '2026-06',
    period,
    currentUserId: CURRENT_USER_ID,
    otherUserId: OTHER_USER_ID,
    today: '2026-06-03'
  });
}

function buildHeatDays(
  expenses: Expense[],
  options: { monthKey?: string; today?: string } = {}
) {
  return buildDashboardHeatDays({
    expenses,
    monthKey: options.monthKey || '2026-06',
    members: ledgerMembers(),
    currentUserId: CURRENT_USER_ID,
    today: options.today || '2026-06-20'
  });
}

function ledgerMembers(): LedgerMemberProfile[] {
  return [
    {
      ledger_id: 'ledger-1',
      user_id: CURRENT_USER_ID,
      joined_at: '2026-01-01T00:00:00Z',
      profile: {
        id: CURRENT_USER_ID,
        display_name: 'Alex',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      }
    },
    {
      ledger_id: 'ledger-1',
      user_id: OTHER_USER_ID,
      joined_at: '2026-01-01T00:00:00Z',
      profile: {
        id: OTHER_USER_ID,
        display_name: 'Mina',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      }
    }
  ];
}

function expense(input: {
  amountYen: number;
  category: string;
  categoryId?: string | null;
  ownership?: 'personal' | 'shared';
  paidBy?: string;
  recurringMonth?: string;
  recurringRuleId?: string;
  spentOn: string;
  splits?: [number, number];
  subcategory?: string | null;
}): Expense {
  const ownership = input.ownership || 'shared';
  const paidBy = input.paidBy || CURRENT_USER_ID;
  const id = `${input.category}-${input.spentOn}-${input.amountYen}`;

  return {
    id,
    ledger_id: 'ledger-1',
    amount_yen: input.amountYen,
    category: input.category,
    category_id: input.categoryId === undefined ? mapLegacyCategoryToId(input.category) : input.categoryId,
    subcategory: input.subcategory === undefined ? null : input.subcategory,
    recurring_rule_id: input.recurringRuleId || null,
    recurring_month: input.recurringMonth || null,
    paid_by: paidBy,
    recorded_by: CURRENT_USER_ID,
    ownership,
    spent_on: input.spentOn,
    note: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    splits: ownership === 'shared'
      ? [
          { expense_id: id, user_id: CURRENT_USER_ID, amount_yen: input.splits?.[0] ?? Math.round(input.amountYen / 2) },
          { expense_id: id, user_id: OTHER_USER_ID, amount_yen: input.splits?.[1] ?? input.amountYen - Math.round(input.amountYen / 2) }
        ]
      : []
  };
}
