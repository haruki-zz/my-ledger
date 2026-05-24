import { useEffect, useMemo, useRef, useState } from 'react';

import { getExpensesByMonth } from '@/src/lib/ledger';
import {
  addMonths,
  buildCategoryMonthlyTrend,
  dashboardEndDateString,
  monthStartDateString,
  type DashboardRange,
  type MonthlyCategoryTrendStat
} from '@/src/lib/stats';
import type { Expense } from '@/src/types/database';

type UseCategoryTrendInput = {
  ledgerId: string | null;
  category: string | null;
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

    if (!ledgerId || !category) {
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
          setError(loadError instanceof Error ? loadError.message : '读取类别趋势失败');
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
    input.dataVersion,
    input.endMonthKey,
    input.ledgerId,
    input.months
  ]);

  const series = useMemo<MonthlyCategoryTrendStat[]>(() => {
    if (!input.category) {
      return [];
    }

    return buildCategoryMonthlyTrend({
      expenses,
      category: input.category,
      endMonthKey: input.endMonthKey,
      months: input.months,
      range: input.range,
      currentUserId: input.currentUserId,
      otherUserId: input.otherUserId
    });
  }, [
    expenses,
    input.category,
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
