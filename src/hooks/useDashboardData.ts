import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/src/context/AuthContext';
import { useLedgerContext } from '@/src/context/LedgerContext';
import {
  generateRecurringExpenses,
  getExpensesByMonth,
  getFirstExpenseSpentOn,
  getLedgerMembers,
  getProfiles,
  getRecurringExpenseRules
} from '@/src/lib/ledger';
import { subscribeToLedgerData } from '@/src/lib/localEvents';
import {
  buildDashboardPeriodStats,
  compareMonthKeys,
  currentMonthKey,
  filterCurrentMonthSettledExpenses,
  monthKeyFromDateString,
  monthStartDateString,
  resolveDashboardDateRange,
  type DashboardPeriod
} from '@/src/lib/stats';
import type { Expense, Ledger, LedgerMemberProfile, Profile, RecurringExpenseRule } from '@/src/types/database';

export function useDashboardData(monthKey: string, period: DashboardPeriod) {
  const { session } = useAuth();
  const { activeLedger, loading: ledgerLoading } = useLedgerContext();
  const currentLedger = activeLedger?.ledger || null;
  const ledgerId = currentLedger?.id || null;
  const currentLedgerRef = useRef<Ledger | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recurringRules, setRecurringRules] = useState<RecurringExpenseRule[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [minimumMonthKey, setMinimumMonthKey] = useState<string | null>(null);
  const [loadedMonthKey, setLoadedMonthKey] = useState<string | null>(null);
  const [loadedPeriod, setLoadedPeriod] = useState<DashboardPeriod | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const requestSequence = useRef(0);
  const hasLoadedData = useRef(false);
  const loadInFlightRef = useRef(false);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);
  const periodRef = useRef(period);

  const requestedDateRange = useMemo(
    () => resolveDashboardDateRange(period, monthKey),
    [monthKey, period]
  );
  const coverageMonthKey = requestedDateRange.effectiveMonthKey;
  const coverageDateRange = useMemo(
    () => resolveDashboardDateRange('month', coverageMonthKey),
    [coverageMonthKey]
  );

  useEffect(() => {
    currentLedgerRef.current = currentLedger;
  }, [currentLedger]);

  useEffect(() => {
    periodRef.current = period;
  }, [period]);

  const load = useCallback(async (options?: { userInitiated?: boolean }) => {
    if (ledgerLoading) {
      return;
    }

    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    const shouldKeepCurrentData = hasLoadedData.current;
    loadInFlightRef.current = true;

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

      const generationMonthKey = monthKeyFromDateString(coverageDateRange.endDateString);
      const generationPromise = generateRecurringExpenses(activeLedger.id, monthStartDateString(generationMonthKey));
      if (generationMonthKey === currentMonthKey()) {
        await generationPromise;
      } else {
        generationPromise.catch((generateError) => {
          console.warn('Dashboard fixed expense generation failed:', generateError instanceof Error ? generateError.message : String(generateError));
        });
      }
      const [nextMembers, firstExpenseSpentOn, nextExpenses, nextRecurringRules] = await Promise.all([
        getLedgerMembers(activeLedger.id),
        getFirstExpenseSpentOn(activeLedger.id),
        getExpensesByMonth(activeLedger.id, coverageDateRange.comparisonStartDateString, coverageDateRange.endDateString, { refreshFirst: true }),
        getRecurringExpenseRules(activeLedger.id, { emitChange: false, refreshFirst: true }).catch((rulesError) => {
          console.warn('Dashboard fixed expense rules reload failed:', rulesError instanceof Error ? rulesError.message : String(rulesError));
          return null;
        })
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
      if (nextRecurringRules !== null) {
        setRecurringRules(nextRecurringRules);
      }
      setProfiles(nextProfiles);
      setCurrentUserId(userId);
      setOtherUserId(nextOtherUserId);
      setMinimumMonthKey(nextMinimumMonthKey);
      setLoadedMonthKey(coverageDateRange.effectiveMonthKey);
      setLoadedPeriod(periodRef.current);
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
      if (requestSequence.current === requestId) {
        loadInFlightRef.current = false;
      }
    }
  }, [
    coverageDateRange.comparisonStartDateString,
    coverageDateRange.effectiveMonthKey,
    coverageDateRange.endDateString,
    ledgerLoading,
    session?.user.id
  ]);

  useEffect(() => {
    requestSequence.current += 1;
    loadInFlightRef.current = false;
    hasLoadedData.current = false;
    setLedger(null);
    setMembers([]);
    setExpenses([]);
    setRecurringRules(null);
    setProfiles({});
    setCurrentUserId(null);
    setOtherUserId(null);
    setMinimumMonthKey(null);
    setLoadedMonthKey(null);
    setLoadedPeriod(null);
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
      if (loadInFlightRef.current) {
        return;
      }
      void loadRef.current();
    });
  }, [ledgerId]);

  const settledExpenses = useMemo(
    // If rule refresh is unavailable, keep showing cached/raw expenses instead of hiding data.
    () => recurringRules
      ? filterCurrentMonthSettledExpenses({ expenses, recurringRules })
      : expenses,
    [expenses, recurringRules]
  );

  const hasCurrentCoverage = loadedMonthKey === coverageMonthKey;
  const statsMonthKey = hasCurrentCoverage
    ? requestedDateRange.effectiveMonthKey
    : loadedMonthKey || requestedDateRange.effectiveMonthKey;
  const statsPeriod = hasCurrentCoverage
    ? period
    : loadedPeriod || period;
  const stats = useMemo(
    () => buildDashboardPeriodStats({
      expenses: settledExpenses,
      monthKey: statsMonthKey,
      period: statsPeriod,
      currentUserId,
      otherUserId
    }),
    [currentUserId, otherUserId, settledExpenses, statsMonthKey, statsPeriod]
  );

  return {
    ledger,
    members,
    expenses,
    settledExpenses,
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
