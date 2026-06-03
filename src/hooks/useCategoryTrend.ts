import { useEffect, useMemo, useRef, useState } from 'react';

import { getExpensesByMonth } from '@/src/lib/ledger';
import {
  addMonths,
  buildCategoryMonthlyTrendForCategories,
  dashboardEndDateString,
  monthStartDateString,
  type DashboardRange,
  type MonthlyCategoryTrendStat
} from '@/src/lib/stats';
import type { Expense } from '@/src/types/database';

type UseCategoryTrendInput = {
  ledgerId: string | null;
  category: string | null;
  categoryNames?: string[];
  endMonthKey: string;
  months: number;
  range: DashboardRange;
  currentUserId: string | null;
  otherUserId: string | null;
  dataVersion: number;
};

export function useCategoryTrend(input: UseCategoryTrendInput) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;

    const ledgerId = input.ledgerId;
    const category = input.category;
    const categoryNames = input.categoryNames && input.categoryNames.length > 0 ? input.categoryNames : category ? [category] : [];

    if (!ledgerId || categoryNames.length === 0) {
      setExpenses([]);
      setError(null);
      setLoading(false);
      return;
    }

    const requestedLedgerId = ledgerId;

    async function load() {
      setError(null);
      setLoading(true);

      try {
        const startMonthKey = addMonths(input.endMonthKey, -(input.months - 1));
        const expenses = await getExpensesByMonth(
          requestedLedgerId,
          monthStartDateString(startMonthKey),
          dashboardEndDateString(input.endMonthKey)
        );

        if (requestSequence.current !== requestId) {
          return;
        }

        setExpenses(expenses);
      } catch (loadError) {
        if (requestSequence.current === requestId) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load category trend');
        }
      } finally {
        if (requestSequence.current === requestId) {
          setLoading(false);
        }
      }
    }

    void load();
  }, [
    input.category,
    input.categoryNames,
    input.dataVersion,
    input.endMonthKey,
    input.ledgerId,
    input.months
  ]);

  const series = useMemo<MonthlyCategoryTrendStat[]>(() => {
    const categoryNames = input.categoryNames && input.categoryNames.length > 0
      ? input.categoryNames
      : input.category
        ? [input.category]
        : [];
    if (categoryNames.length === 0) {
      return [];
    }

    return buildCategoryMonthlyTrendForCategories({
      expenses,
      categories: categoryNames,
      endMonthKey: input.endMonthKey,
      months: input.months,
      range: input.range,
      currentUserId: input.currentUserId,
      otherUserId: input.otherUserId
    });
  }, [
    expenses,
    input.category,
    input.categoryNames,
    input.currentUserId,
    input.endMonthKey,
    input.months,
    input.otherUserId,
    input.range
  ]);

  return {
    series,
    loading,
    error
  };
}
