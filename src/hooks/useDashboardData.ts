import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/src/context/AuthContext';
import { useLedgerContext } from '@/src/context/LedgerContext';
import {
  getExpensesByMonth,
  getFirstExpenseSpentOn,
  getLedgerMembers,
  getProfiles
} from '@/src/lib/ledger';
import { subscribeToLedgerData } from '@/src/lib/localEvents';
import {
  buildDashboardPeriodStats,
  compareMonthKeys,
  monthKeyFromDateString,
  resolveDashboardDateRange,
  type DashboardPeriod
} from '@/src/lib/stats';
import type { Expense, Ledger, LedgerMemberProfile, Profile } from '@/src/types/database';

export function useDashboardData(monthKey: string, period: DashboardPeriod) {
  const { session } = useAuth();
  const { activeLedger, loading: ledgerLoading } = useLedgerContext();
  const currentLedger = activeLedger?.ledger || null;
  const ledgerId = currentLedger?.id || null;
  const currentLedgerRef = useRef<Ledger | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [minimumMonthKey, setMinimumMonthKey] = useState<string | null>(null);
  const [loadedMonthKey, setLoadedMonthKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const requestSequence = useRef(0);
  const hasLoadedData = useRef(false);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    currentLedgerRef.current = currentLedger;
  }, [currentLedger]);

  const load = useCallback(async (options?: { userInitiated?: boolean }) => {
    if (ledgerLoading) {
      return;
    }

    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    const shouldKeepCurrentData = hasLoadedData.current;

    setError(null);
    setLoading(!shouldKeepCurrentData);
    setRefreshing(shouldKeepCurrentData);

    try {
      const userId = session?.user.id || null;
      if (!userId) {
        router.replace('/auth');
        return;
      }

      const activeLedger = currentLedgerRef.current;
      if (!activeLedger) {
        router.replace('/ledger');
        return;
      }

      const dateRange = resolveDashboardDateRange(period, monthKey);
      const [nextMembers, firstExpenseSpentOn, nextExpenses] = await Promise.all([
        getLedgerMembers(activeLedger.id),
        getFirstExpenseSpentOn(activeLedger.id),
        getExpensesByMonth(activeLedger.id, dateRange.comparisonStartDateString, dateRange.endDateString)
      ]);

      const nextOtherUserId = nextMembers.find((member) => member.user_id !== userId)?.user_id || null;
      const memberProfileIds = nextMembers.map((member) => member.user_id);
      const expenseProfileIds = nextExpenses.flatMap((expense) => [
        expense.paid_by,
        expense.recorded_by,
        ...expense.splits.map((split) => split.user_id)
      ]);
      const nextProfiles = await getProfiles([...memberProfileIds, ...expenseProfileIds]);
      const ledgerCreatedMonth = monthKeyFromDateString(activeLedger.created_at);
      const firstExpenseMonth = firstExpenseSpentOn ? monthKeyFromDateString(firstExpenseSpentOn) : null;
      const nextMinimumMonthKey = firstExpenseMonth && compareMonthKeys(firstExpenseMonth, ledgerCreatedMonth) < 0
        ? firstExpenseMonth
        : ledgerCreatedMonth;

      if (requestSequence.current !== requestId) {
        return;
      }

      setLedger(activeLedger);
      setMembers(nextMembers);
      setExpenses(nextExpenses);
      setProfiles(nextProfiles);
      setCurrentUserId(userId);
      setOtherUserId(nextOtherUserId);
      setMinimumMonthKey(nextMinimumMonthKey);
      setLoadedMonthKey(dateRange.effectiveMonthKey);
      setDataVersion((current) => current + 1);
      hasLoadedData.current = true;
    } catch (loadError) {
      if (requestSequence.current === requestId) {
        if (shouldKeepCurrentData && !options?.userInitiated) {
          console.warn('Dashboard background reload failed:', loadError instanceof Error ? loadError.message : String(loadError));
        } else {
          setError(loadError instanceof Error ? loadError.message : 'Could not load dashboard');
        }
      }
    } finally {
      if (requestSequence.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [ledgerLoading, monthKey, period, session?.user.id]);

  useEffect(() => {
    requestSequence.current += 1;
    hasLoadedData.current = false;
    setLedger(null);
    setMembers([]);
    setExpenses([]);
    setProfiles({});
    setCurrentUserId(null);
    setOtherUserId(null);
    setMinimumMonthKey(null);
    setLoadedMonthKey(null);
    setDataVersion((current) => current + 1);
  }, [ledgerId]);

  useEffect(() => {
    load();
  }, [ledgerId, load]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (!ledgerId) {
      return undefined;
    }

    return subscribeToLedgerData(ledgerId, () => {
      void loadRef.current();
    });
  }, [ledgerId]);

  const stats = useMemo(
    () => buildDashboardPeriodStats({
      expenses,
      monthKey: loadedMonthKey || monthKey,
      period,
      currentUserId,
      otherUserId
    }),
    [currentUserId, expenses, loadedMonthKey, monthKey, otherUserId, period]
  );

  return {
    ledger,
    members,
    expenses,
    profiles,
    currentUserId,
    otherUserId,
    minimumMonthKey,
    loadedMonthKey,
    stats,
    dataVersion,
    loading,
    refreshing,
    error,
    reload: load
  };
}
