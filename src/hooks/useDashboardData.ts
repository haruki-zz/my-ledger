import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getExpensesByMonth,
  getFirstExpenseSpentOn,
  getLedgerMembers,
  getMyLedger,
  getProfiles
} from '@/src/lib/ledger';
import {
  buildDashboardStats,
  compareMonthKeys,
  dashboardEndDateString,
  monthKeyFromDateString,
  monthStartDateString,
  type DashboardRange
} from '@/src/lib/stats';
import { supabase } from '@/src/lib/supabase';
import type { Expense, Ledger, LedgerMemberProfile, Profile } from '@/src/types/database';

let realtimeSubscriptionSequence = 0;

export function useDashboardData(monthKey: string, range: DashboardRange) {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [minimumMonthKey, setMinimumMonthKey] = useState<string | null>(null);
  const [loadedMonthKey, setLoadedMonthKey] = useState<string | null>(null);
  const [loadedEndDateString, setLoadedEndDateString] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const hasLoadedData = useRef(false);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);

  const load = useCallback(async () => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    const shouldKeepCurrentData = hasLoadedData.current;

    setError(null);
    setLoading(!shouldKeepCurrentData);
    setRefreshing(shouldKeepCurrentData);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        throw userError;
      }

      const userId = userData.user?.id || null;
      const currentLedger = await getMyLedger();
      if (!currentLedger) {
        router.replace('/ledger');
        return;
      }

      const endDateString = dashboardEndDateString(monthKey);
      const [nextMembers, firstExpenseSpentOn, nextExpenses] = await Promise.all([
        getLedgerMembers(currentLedger.id),
        getFirstExpenseSpentOn(currentLedger.id),
        getExpensesByMonth(currentLedger.id, monthStartDateString(monthKey), endDateString)
      ]);

      const nextOtherUserId = nextMembers.find((member) => member.user_id !== userId)?.user_id || null;
      const memberProfileIds = nextMembers.map((member) => member.user_id);
      const expenseProfileIds = nextExpenses.flatMap((expense) => [
        expense.paid_by,
        expense.recorded_by,
        ...expense.splits.map((split) => split.user_id)
      ]);
      const nextProfiles = await getProfiles([...memberProfileIds, ...expenseProfileIds]);
      const ledgerCreatedMonth = monthKeyFromDateString(currentLedger.created_at);
      const firstExpenseMonth = firstExpenseSpentOn ? monthKeyFromDateString(firstExpenseSpentOn) : null;
      const nextMinimumMonthKey = firstExpenseMonth && compareMonthKeys(firstExpenseMonth, ledgerCreatedMonth) < 0
        ? firstExpenseMonth
        : ledgerCreatedMonth;

      if (requestSequence.current !== requestId) {
        return;
      }

      setLedger(currentLedger);
      setMembers(nextMembers);
      setExpenses(nextExpenses);
      setProfiles(nextProfiles);
      setCurrentUserId(userId);
      setOtherUserId(nextOtherUserId);
      setMinimumMonthKey(nextMinimumMonthKey);
      setLoadedMonthKey(monthKey);
      setLoadedEndDateString(endDateString);
      hasLoadedData.current = true;
    } catch (loadError) {
      if (requestSequence.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : '读取首页失败');
      }
    } finally {
      if (requestSequence.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [monthKey]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    const ledgerId = ledger?.id;
    if (!ledgerId) {
      return undefined;
    }

    const subscriptionId = ++realtimeSubscriptionSequence;
    const channel = supabase
      .channel(`ledger-dashboard-${ledgerId}-${subscriptionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expenses',
          filter: `ledger_id=eq.${ledgerId}`
        },
        () => {
          void loadRef.current();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expense_splits'
        },
        () => {
          void loadRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ledger?.id]);

  const stats = useMemo(
    () => buildDashboardStats({
      expenses,
      monthKey: loadedMonthKey || monthKey,
      endDateString: loadedEndDateString || dashboardEndDateString(monthKey),
      range,
      currentUserId,
      otherUserId
    }),
    [currentUserId, expenses, loadedEndDateString, loadedMonthKey, monthKey, otherUserId, range]
  );

  return {
    ledger,
    members,
    profiles,
    currentUserId,
    otherUserId,
    minimumMonthKey,
    loadedMonthKey,
    stats,
    loading,
    refreshing,
    error,
    reload: load
  };
}
