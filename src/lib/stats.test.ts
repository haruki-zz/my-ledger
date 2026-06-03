import { describe, expect, it } from 'vitest';

import {
  buildDashboardDailyUserSeriesForCategories,
  buildDashboardPeriodStats,
  resolveDashboardDateRange,
  type DashboardPeriod
} from './stats';
import type { Expense } from '@/src/types/database';

const CURRENT_USER_ID = 'user-a';
const OTHER_USER_ID = 'user-b';

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
      comparisonLabel: 'vs last Mon-Wed'
    });
  });

  it('resolves Monday week as one day of data', () => {
    expect(resolveDashboardDateRange('week', '2026-05', '2026-06-01')).toMatchObject({
      startDateString: '2026-06-01',
      endDateString: '2026-06-01',
      comparisonStartDateString: '2026-05-25',
      comparisonEndDateString: '2026-05-25',
      comparisonLabel: 'vs last Mon'
    });
  });

  it('uses today as the current month cutoff', () => {
    expect(resolveDashboardDateRange('month', '2026-06', '2026-06-03')).toMatchObject({
      startDateString: '2026-06-01',
      endDateString: '2026-06-03',
      comparisonStartDateString: '2026-05-01',
      comparisonEndDateString: '2026-05-03'
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
});

describe('buildDashboardPeriodStats', () => {
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

  it('aggregates category rows as top four plus Other', () => {
    const stats = buildStats('month', [
      expense({ amountYen: 600, category: 'Housing', spentOn: '2026-06-01' }),
      expense({ amountYen: 500, category: 'Food & Dining', spentOn: '2026-06-01' }),
      expense({ amountYen: 400, category: 'Transport', spentOn: '2026-06-01' }),
      expense({ amountYen: 300, category: 'Utilities', spentOn: '2026-06-01' }),
      expense({ amountYen: 200, category: 'Shopping', spentOn: '2026-06-01' }),
      expense({ amountYen: 100, category: 'Travel', spentOn: '2026-06-01' })
    ]);

    expect(stats.categories.map((category) => category.category)).toEqual([
      'Housing',
      'Food & Dining',
      'Transport',
      'Utilities',
      'Other'
    ]);
    expect(stats.categories[4]).toMatchObject({
      amountYen: 300,
      percentage: expect.closeTo(14.285, 2),
      sourceCategories: ['Shopping', 'Travel']
    });
  });

  it('keeps daily series scoped to aggregated Other source categories', () => {
    const expenses = [
      expense({ amountYen: 600, category: 'Housing', spentOn: '2026-06-01' }),
      expense({ amountYen: 500, category: 'Food & Dining', spentOn: '2026-06-01' }),
      expense({ amountYen: 400, category: 'Transport', spentOn: '2026-06-01' }),
      expense({ amountYen: 300, category: 'Utilities', spentOn: '2026-06-01' }),
      expense({ amountYen: 200, category: 'Shopping', spentOn: '2026-06-02' }),
      expense({ amountYen: 100, category: 'Travel', spentOn: '2026-06-03' })
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

    expect(series.map((day) => day.totalAmountYen)).toEqual([0, 200, 100]);
  });

  it('merges an existing Other category into the aggregated Other row', () => {
    const stats = buildStats('month', [
      expense({ amountYen: 600, category: 'Housing', spentOn: '2026-06-01' }),
      expense({ amountYen: 500, category: 'Food & Dining', spentOn: '2026-06-01' }),
      expense({ amountYen: 400, category: 'Transport', spentOn: '2026-06-01' }),
      expense({ amountYen: 300, category: 'Utilities', spentOn: '2026-06-01' }),
      expense({ amountYen: 250, category: 'Other', spentOn: '2026-06-02' }),
      expense({ amountYen: 200, category: 'Shopping', spentOn: '2026-06-02' }),
      expense({ amountYen: 100, category: 'Travel', spentOn: '2026-06-03' })
    ]);

    expect(stats.categories.map((category) => category.category)).toEqual([
      'Housing',
      'Food & Dining',
      'Transport',
      'Utilities',
      'Other'
    ]);
    expect(stats.categories[4]).toMatchObject({
      amountYen: 550,
      sourceCategories: ['Shopping', 'Travel', 'Other']
    });
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

function expense(input: {
  amountYen: number;
  category: string;
  ownership?: 'personal' | 'shared';
  paidBy?: string;
  spentOn: string;
  splits?: [number, number];
}): Expense {
  const ownership = input.ownership || 'shared';
  const paidBy = input.paidBy || CURRENT_USER_ID;
  const id = `${input.category}-${input.spentOn}-${input.amountYen}`;

  return {
    id,
    ledger_id: 'ledger-1',
    amount_yen: input.amountYen,
    category: input.category,
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
