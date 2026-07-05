import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';

import {
  AnimatedChevron,
  AnimatedSkeletonBlock,
  motionCardResizeTransition,
  motionPanelIn,
  motionPanelOut
} from '@/src/components/motion';
import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { BentoCard, SwipeExpenseRow, type ExpenseBadge } from '@/src/components/ui';
import {
  ExpenseDetailModal,
  SplitBreakdownModal,
  type HistoryExpenseItem
} from '@/src/components/history/HistoryExpenseModals';
import { useAuth } from '@/src/context/AuthContext';
import { useLedgerContext } from '@/src/context/LedgerContext';
import { SlidingValueText } from '@/src/components/SlidingValueText';
import {
  categoryColor,
  categoryIconName,
  categoryLabel,
  categoryWithSubcategory,
  PRIMARY_CATEGORIES,
  resolveCategory,
  type PrimaryCategoryId
} from '@/src/lib/categorySystem';
import { buildUserColorMap, DEFAULT_USER_COLOR } from '@/src/lib/entityColors';
import { displayName, formatYen } from '@/src/lib/format';
import { participantBadgeUserIds } from '@/src/lib/historyPresentation';
import { useReduceMotion } from '@/src/lib/motion';
import {
  deleteExpense,
  generateRecurringExpenses,
  getExpenses,
  getLedgerMembers,
  getProfiles,
  getRecurringExpenseRules
} from '@/src/lib/ledger';
import { subscribeToLedgerData } from '@/src/lib/localEvents';
import { currentMonthStartDate } from '@/src/lib/recurring';
import {
  addMonths,
  amountForUser,
  buildMonthlyReceipts,
  currentMonthKey,
  filterCurrentMonthSettledExpenses,
  formatMonthLabel,
  monthKeyFromDateString,
  type MonthlyReceiptStat
} from '@/src/lib/stats';
import type { Expense, Ledger, Profile, RecurringExpenseRule } from '@/src/types/database';

type FilteredExpense = HistoryExpenseItem;

type HistorySection = {
  count: number;
  data: FilteredExpense[];
  date: string;
  totalYen: number;
};

type LoadMode = 'background' | 'initial' | 'refresh';
type HistoryScopeMode = 'personal' | 'together';
type HistoryViewMode = 'ledger' | 'records';

type LedgerYearGroup = {
  months: MonthlyReceiptStat[];
  totalYen: number;
  year: string;
};

type CapsuleEntry = {
  amountYen: number;
  categoryId: PrimaryCategoryId;
  color: string;
  label: string;
};

type TrendPoint = {
  monthKey: string;
  totalYen: number;
};

const CAPSULE_COUNT = 20;
const DASHBOARD_CATEGORY_LIMIT = 5;
const NEUTRAL_CAPSULE_COLOR = 'rgba(42,39,34,0.18)';
const OTHER_CATEGORY_COLOR = '#9A8F80';

const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});
const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short'
});
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  hour12: false,
  minute: '2-digit'
});
const monthAbbreviationFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short'
});
const shortMonthWithYearFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: '2-digit'
});

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { activeLedger, loading: ledgerLoading } = useLedgerContext();
  const params = useLocalSearchParams<{ date?: string | string[]; month?: string | string[]; resetToLedger?: string | string[] }>();
  const currentLedger = activeLedger?.ledger || null;
  const activeLedgerId = activeLedger?.ledger.id || null;
  const currentUserId = session?.user.id || null;
  const currentLedgerRef = useRef<Ledger | null>(null);
  const loadInFlightRef = useRef(false);
  const collapseDefaultsMonthRef = useRef<string | null>(null);
  const recordsListRef = useRef<FlatList<HistorySection> | null>(null);
  const ledgerScrollRef = useRef<ScrollView | null>(null);
  const ledgerScrollOffsetRef = useRef(0);
  const scrolledTargetRef = useRef<string | null>(null);
  const consumedTargetParamRef = useRef<string | null>(null);
  const consumedResetParamRef = useRef<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recurringRules, setRecurringRules] = useState<RecurringExpenseRule[] | null>(null);
  const [activeMemberIds, setActiveMemberIds] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyScope, setHistoryScope] = useState<HistoryScopeMode>('personal');
  const [viewMode, setViewMode] = useState<HistoryViewMode>('ledger');
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [detailSelection, setDetailSelection] = useState<FilteredExpense | null>(null);
  const [splitSelection, setSplitSelection] = useState<FilteredExpense | null>(null);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [targetRequestId, setTargetRequestId] = useState(0);

  useEffect(() => {
    currentLedgerRef.current = currentLedger;
  }, [currentLedger]);

  const load = useCallback(async (mode: LoadMode = 'background') => {
    if (ledgerLoading) {
      if (mode === 'refresh') {
        setRefreshing(false);
      }
      return;
    }

    loadInFlightRef.current = true;
    setError(null);
    if (mode === 'initial') {
      setLoading(true);
    }
    if (mode === 'refresh') {
      setRefreshing(true);
    }

    try {
      const activeLedger = currentLedgerRef.current;
      if (!activeLedger) {
        router.replace('/ledger');
        return;
      }

      await generateRecurringExpenses(activeLedger.id, currentMonthStartDate());

      const [nextExpenses, nextMembers, nextRecurringRules] = await Promise.all([
        getExpenses(activeLedger.id),
        getLedgerMembers(activeLedger.id),
        getRecurringExpenseRules(activeLedger.id, { emitChange: false, refreshFirst: true }).catch((rulesError) => {
          console.warn('History fixed expense rules reload failed:', rulesError instanceof Error ? rulesError.message : String(rulesError));
          return null;
        })
      ]);
      const profileIds = new Set<string>();
      for (const expense of nextExpenses) {
        profileIds.add(expense.paid_by);
        profileIds.add(expense.recorded_by);
        expense.splits.forEach((split) => profileIds.add(split.user_id));
      }
      nextMembers.forEach((member) => profileIds.add(member.user_id));

      setExpenses(nextExpenses);
      if (nextRecurringRules !== null) {
        setRecurringRules(nextRecurringRules);
      }
      setActiveMemberIds(new Set(nextMembers.map((member) => member.user_id)));
      setProfiles(await getProfiles([...profileIds]));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load expenses');
    } finally {
      if (mode === 'initial') {
        setLoading(false);
      }
      if (mode === 'refresh') {
        setRefreshing(false);
      }
      loadInFlightRef.current = false;
    }
  }, [ledgerLoading]);

  useEffect(() => {
    loadInFlightRef.current = false;
    setExpenses([]);
    setRecurringRules(null);
    setProfiles({});
    setActiveMemberIds(new Set());
    setHistoryScope('personal');
    setViewMode('ledger');
    setSelectedMonthKey(null);
    setCollapsedSections(new Set());
    setTargetDate(null);
    setTargetRequestId(0);
    setDetailSelection(null);
    setSplitSelection(null);
    ledgerScrollOffsetRef.current = 0;
    scrolledTargetRef.current = null;
    consumedTargetParamRef.current = null;
    consumedResetParamRef.current = null;
    collapseDefaultsMonthRef.current = null;
  }, [activeLedgerId]);

  useEffect(() => {
    const paramDate = firstParam(params.date);
    const paramMonth = firstParam(params.month);
    const resetParam = firstParam(params.resetToLedger);

    if (resetParam && consumedResetParamRef.current !== resetParam) {
      consumedResetParamRef.current = resetParam;
      setViewMode('ledger');
      setSelectedMonthKey(null);
      setTargetDate(null);
      setTargetRequestId((current) => current + 1);
      scrolledTargetRef.current = null;
      collapseDefaultsMonthRef.current = null;
      router.setParams({ date: undefined, month: undefined, resetToLedger: undefined });
      return;
    }

    const targetMonth = paramMonth && isMonthString(paramMonth)
      ? paramMonth
      : paramDate && isDateString(paramDate)
        ? monthKeyFromDateString(paramDate)
        : null;
    const targetParamKey = targetMonth
      ? `${targetMonth}:${paramDate && isDateString(paramDate) ? paramDate : ''}`
      : null;

    if (targetMonth && targetParamKey && consumedTargetParamRef.current !== targetParamKey) {
      consumedTargetParamRef.current = targetParamKey;
      setSelectedMonthKey(targetMonth);
      setViewMode('records');
      setTargetDate(paramDate && isDateString(paramDate) && monthKeyFromDateString(paramDate) === targetMonth ? paramDate : null);
      setTargetRequestId((current) => current + 1);
      scrolledTargetRef.current = null;
      collapseDefaultsMonthRef.current = null;
      router.setParams({ date: undefined, month: undefined });
      return;
    }

    if (!paramDate && !paramMonth) {
      consumedTargetParamRef.current = null;
    }
    if (!resetParam) {
      consumedResetParamRef.current = null;
    }
  }, [activeLedgerId, params.date, params.month, params.resetToLedger]);

  useEffect(() => {
    void load('initial');
  }, [activeLedgerId, load]);

  const ledgerId = activeLedgerId;

  useEffect(() => {
    if (!ledgerId) {
      return undefined;
    }

    return subscribeToLedgerData(ledgerId, () => {
      if (loadInFlightRef.current) {
        return;
      }
      void load('background');
    });
  }, [ledgerId, load]);

  const profileDisplayName = useCallback((userId: string) => {
    const suffix = activeMemberIds.has(userId) ? '' : ' (left)';
    return `${displayName(profiles[userId]?.display_name)}${suffix}`;
  }, [activeMemberIds, profiles]);

  const settledExpenses = useMemo(
    // If rule refresh is unavailable, keep showing cached/raw expenses instead of hiding data.
    () => recurringRules
      ? filterCurrentMonthSettledExpenses({ expenses, recurringRules })
      : expenses,
    [expenses, recurringRules]
  );

  const userOptionIds = useMemo(() => {
    const userIds = new Set<string>();
    activeMemberIds.forEach((userId) => userIds.add(userId));

    for (const expense of settledExpenses) {
      userIds.add(expense.paid_by);
      expense.splits.forEach((split) => userIds.add(split.user_id));
    }

    return [...userIds];
  }, [activeMemberIds, settledExpenses]);

  const sortedUserIds = useMemo(() => (
    [...userOptionIds].sort((a, b) => {
      const nameComparison = profileDisplayName(a).localeCompare(profileDisplayName(b));
      return nameComparison || a.localeCompare(b);
    })
  ), [profileDisplayName, userOptionIds]);

  const userColorById = useMemo(() => (
    buildUserColorMap(sortedUserIds, currentUserId)
  ), [currentUserId, sortedUserIds]);

  const otherUserId = useMemo(() => (
    sortedUserIds.find((userId) => userId !== currentUserId) || null
  ), [currentUserId, sortedUserIds]);
  const currentUserColor = currentUserId ? userColorById.get(currentUserId) || DEFAULT_USER_COLOR : DEFAULT_USER_COLOR;
  const otherUserColor = otherUserId ? userColorById.get(otherUserId) || colors.accent : colors.accent;
  const canToggleHistoryScope = Boolean(currentUserId && otherUserId);
  const effectiveHistoryScope: HistoryScopeMode = historyScope === 'together' && canToggleHistoryScope ? 'together' : 'personal';
  const historyScopeViewerId = effectiveHistoryScope === 'personal' ? currentUserId : null;

  const activeMemberNames = useMemo(() => {
    const names = [...activeMemberIds]
      .sort((a, b) => {
        if (a === currentUserId) {
          return -1;
        }
        if (b === currentUserId) {
          return 1;
        }
        const nameComparison = profileDisplayName(a).localeCompare(profileDisplayName(b));
        return nameComparison || a.localeCompare(b);
      })
      .map((userId) => profileDisplayName(userId).replace(/ \(left\)$/, ''));

    return names.length > 0 ? names.join(' & ') : 'MEMBERS';
  }, [activeMemberIds, currentUserId, profileDisplayName]);
  const personalScopeName = currentUserId
    ? profileDisplayName(currentUserId).replace(/ \(left\)$/, '')
    : 'ME';
  const historyScopeLabel = effectiveHistoryScope === 'personal'
    ? personalScopeName
    : activeMemberNames;
  const scopedHistoryItems = useMemo<FilteredExpense[]>(
    () => buildScopedHistoryItems(settledExpenses, historyScopeViewerId),
    [historyScopeViewerId, settledExpenses]
  );
  const scopedReceiptExpenses = useMemo(
    () => scopedHistoryItems.map((item) => ({
      ...item.expense,
      amount_yen: item.displayAmountYen
    })),
    [scopedHistoryItems]
  );

  const startMonthKey = useMemo(() => {
    const firstExpense = scopedHistoryItems
      .map((item) => item.expense.spent_on)
      .sort((a, b) => a.localeCompare(b))[0];
    return firstExpense ? monthKeyFromDateString(firstExpense) : null;
  }, [scopedHistoryItems]);

  const monthlyReceipts = useMemo(() => {
    if (!startMonthKey) {
      return [];
    }

    return buildMonthlyReceipts({
      currentUserId,
      endBeforeMonthKey: addMonths(currentMonthKey(), 1),
      expenses: scopedReceiptExpenses,
      otherUserId,
      startMonthKey
    });
  }, [currentUserId, otherUserId, scopedReceiptExpenses, startMonthKey]);

  const trendPoints = useMemo(() => buildTrendPoints(monthlyReceipts), [monthlyReceipts]);
  const trendMax = useMemo(() => Math.max(0, ...trendPoints.map((point) => point.totalYen)), [trendPoints]);
  const yearGroups = useMemo<LedgerYearGroup[]>(() => {
    const groups = new Map<string, MonthlyReceiptStat[]>();
    for (const receipt of monthlyReceipts) {
      const year = receipt.monthKey.slice(0, 4);
      const current = groups.get(year) || [];
      current.push(receipt);
      groups.set(year, current);
    }

    return [...groups.entries()].map(([year, months]) => ({
      months,
      totalYen: months.reduce((sum, receipt) => sum + receipt.totalYen, 0),
      year
    }));
  }, [monthlyReceipts]);

  const filteredExpenses = useMemo<FilteredExpense[]>(() => {
    if (!selectedMonthKey) {
      return [];
    }

    return scopedHistoryItems
      .filter((item) => monthKeyFromDateString(item.expense.spent_on) === selectedMonthKey)
      .sort((a, b) => (
        b.expense.spent_on.localeCompare(a.expense.spent_on) ||
        b.expense.created_at.localeCompare(a.expense.created_at)
      ));
  }, [scopedHistoryItems, selectedMonthKey]);

  const sections = useMemo<HistorySection[]>(() => {
    const sectionMap = new Map<string, FilteredExpense[]>();

    for (const item of filteredExpenses) {
      const existing = sectionMap.get(item.expense.spent_on) || [];
      existing.push(item);
      sectionMap.set(item.expense.spent_on, existing);
    }

    return [...sectionMap.entries()].map(([date, items]) => ({
      count: items.length,
      data: items,
      date,
      totalYen: items.reduce((sum, item) => sum + item.displayAmountYen, 0)
    }));
  }, [filteredExpenses]);

  const scrollToTargetDate = useCallback((date: string, animated: boolean) => {
    const targetIndex = sections.findIndex((section) => section.date === date);
    if (targetIndex < 0) {
      return false;
    }

    recordsListRef.current?.scrollToIndex({
      animated,
      index: targetIndex,
      viewOffset: insets.top + 92,
      viewPosition: 0
    });
    return true;
  }, [insets.top, sections]);

  useEffect(() => {
    if (!selectedMonthKey || viewMode !== 'records') {
      return;
    }

    const monthDates = [...new Set(
      filteredExpenses
        .filter((item) => monthKeyFromDateString(item.expense.spent_on) === selectedMonthKey)
        .map((item) => item.expense.spent_on)
    )].sort((a, b) => b.localeCompare(a));

    if (monthDates.length === 0) {
      setCollapsedSections(new Set());
      return;
    }

    const today = todayDateString();
    const targetMonthDate = targetDate && targetDate.startsWith(`${selectedMonthKey}-`)
      ? targetDate
      : null;
    const collapseKey = `${selectedMonthKey}:${targetMonthDate || ''}:${monthDates.join('|')}`;

    if (collapseDefaultsMonthRef.current === collapseKey) {
      return;
    }

    const dateToExpand = targetMonthDate ||
      (selectedMonthKey === currentMonthKey() && monthDates.includes(today) ? today : monthDates[0]);

    setCollapsedSections(new Set(monthDates.filter((date) => date !== dateToExpand)));
    collapseDefaultsMonthRef.current = collapseKey;
  }, [filteredExpenses, selectedMonthKey, targetDate, viewMode]);

  useEffect(() => {
    if (!targetDate || !selectedMonthKey || targetDate.slice(0, 7) !== selectedMonthKey || viewMode !== 'records') {
      return;
    }

    if (!sections.some((section) => section.date === targetDate)) {
      return;
    }

    if (collapsedSections.has(targetDate)) {
      setCollapsedSections((current) => {
        const next = new Set(current);
        next.delete(targetDate);
        return next;
      });
      return;
    }

    const scrollKey = `${activeLedgerId || 'ledger'}:${targetDate}:${targetRequestId}`;
    if (scrolledTargetRef.current === scrollKey) {
      return;
    }

    scrolledTargetRef.current = scrollKey;
    requestAnimationFrame(() => {
      scrollToTargetDate(targetDate, true);
    });
  }, [
    activeLedgerId,
    collapsedSections,
    scrollToTargetDate,
    sections,
    selectedMonthKey,
    targetDate,
    targetRequestId,
    viewMode
  ]);

  useEffect(() => {
    if (viewMode !== 'ledger') {
      return;
    }

    requestAnimationFrame(() => {
      ledgerScrollRef.current?.scrollTo({ animated: false, y: ledgerScrollOffsetRef.current });
    });
  }, [viewMode]);

  function openMonth(monthKey: string) {
    setSelectedMonthKey(monthKey);
    setTargetDate(null);
    setTargetRequestId((current) => current + 1);
    scrolledTargetRef.current = null;
    collapseDefaultsMonthRef.current = null;
    setViewMode('records');
    router.setParams({ month: monthKey, date: undefined });
  }

  function toggleHistoryScope() {
    if (!canToggleHistoryScope) {
      return;
    }

    setHistoryScope((current) => current === 'personal' ? 'together' : 'personal');
    setCollapsedSections(new Set());
    collapseDefaultsMonthRef.current = null;
  }

  function closeMonth() {
    setViewMode('ledger');
    setSelectedMonthKey(null);
    setTargetDate(null);
    setTargetRequestId((current) => current + 1);
    scrolledTargetRef.current = null;
    collapseDefaultsMonthRef.current = null;
    router.setParams({ month: undefined, date: undefined });
  }

  function handleLedgerScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    ledgerScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
  }

  function toggleSection(date: string) {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }

      return next;
    });
  }

  const expenseBadges = useCallback((expense: Expense): ExpenseBadge[] => {
    const participantIds = participantBadgeUserIds(expense);

    return participantIds.map((userId) => ({
      accent: userColorById.get(userId) || DEFAULT_USER_COLOR,
      id: `participant-${expense.id}-${userId}`,
      label: profileDisplayName(userId)
    }));
  }, [profileDisplayName, userColorById]);

  async function confirmDelete(expenseId: string) {
    Alert.alert('Delete Expense', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setDetailSelection(null);
            setSplitSelection(null);
            await deleteExpense(expenseId);
            await load('background');
          } catch (deleteError) {
            Alert.alert('Delete Failed', deleteError instanceof Error ? deleteError.message : 'Please try again later');
          }
        }
      }
    ]);
  }

  const contentTopPadding = insets.top + 16;

  return (
    <>
      {viewMode === 'ledger' ? (
        <ScrollView
          ref={ledgerScrollRef}
          contentContainerStyle={[styles.content, localStyles.ledgerContent, { paddingTop: contentTopPadding }]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onScroll={handleLedgerScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} />}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={styles.page}
        >
          <LedgerHeader
            error={error}
          />

          {loading ? <HistoryLedgerSkeleton /> : monthlyReceipts.length === 0 ? (
            <BentoCard style={localStyles.emptyCard}>
              <Text style={styles.h2}>No Expenses Yet</Text>
              <Text style={styles.muted}>Tap the floating add button to create the first record.</Text>
            </BentoCard>
          ) : (
            <>
              <TrendCard
                canToggleScope={canToggleHistoryScope}
                currentUserColor={currentUserColor}
                historyScope={effectiveHistoryScope}
                maxYen={trendMax}
                onToggleScope={toggleHistoryScope}
                otherUserColor={otherUserColor}
                points={trendPoints}
                scopeLabel={historyScopeLabel}
              />
              <LedgerTable
                currentMonth={currentMonthKey()}
                groups={yearGroups}
                onOpenMonth={openMonth}
              />
            </>
          )}
        </ScrollView>
      ) : (
        <FlatList
          ref={recordsListRef}
          data={sections}
          ListEmptyComponent={(
            <View style={localStyles.emptyState}>
              {loading ? (
                <HistoryRecordsSkeleton />
              ) : selectedMonthKey ? (
                <BentoCard>
                  <Text style={styles.h2}>No Expenses This Month</Text>
                  <Text style={styles.muted}>There are no records for {formatMonthLabel(selectedMonthKey)}.</Text>
                </BentoCard>
              ) : null}
            </View>
          )}
          ListHeaderComponent={(
            <RecordsHeader
              error={error}
              monthKey={selectedMonthKey}
              onBack={closeMonth}
            />
          )}
          contentContainerStyle={[styles.content, localStyles.recordsContent, { paddingTop: contentTopPadding }]}
          initialNumToRender={18}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          extraData={collapsedSections}
          keyExtractor={(item) => item.date}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} />}
          onScrollToIndexFailed={() => {
            if (!targetDate || !selectedMonthKey || targetDate.slice(0, 7) !== selectedMonthKey) {
              return;
            }

            setTimeout(() => scrollToTargetDate(targetDate, false), 250);
          }}
          renderItem={({ item }) => (
            <AnimatedDaySectionCard
              collapsed={collapsedSections.has(item.date)}
              expenseBadges={expenseBadges}
              onDelete={(expense) => confirmDelete(expense.id)}
              onEdit={(expense) => router.push(`/expenses/${expense.id}`)}
              onSplitBreakdown={setSplitSelection}
              onToggle={() => toggleSection(item.date)}
              onViewDetails={setDetailSelection}
              section={item}
            />
          )}
          showsVerticalScrollIndicator={false}
          style={styles.page}
        />
      )}

      {detailSelection ? (
        <ExpenseDetailModal
          formatCreatedAt={formatCreatedAt}
          formatHistoryDate={formatHistoryDate}
          item={detailSelection}
          onClose={() => setDetailSelection(null)}
          onDelete={() => confirmDelete(detailSelection.expense.id)}
          onEdit={() => router.push(`/expenses/${detailSelection.expense.id}`)}
          onSplit={() => {
            setSplitSelection(detailSelection);
            setDetailSelection(null);
          }}
          profileDisplayName={profileDisplayName}
        />
      ) : null}

      {splitSelection ? (
        <SplitBreakdownModal
          item={splitSelection}
          onClose={() => setSplitSelection(null)}
          profileDisplayName={profileDisplayName}
        />
      ) : null}
    </>
  );
}

function LedgerHeader({
  error
}: {
  error: string | null;
}) {
  return (
    <View style={localStyles.ledgerHeader}>
      <Text style={localStyles.historyTitle}>History</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function TrendCard({
  canToggleScope,
  currentUserColor,
  historyScope,
  maxYen,
  onToggleScope,
  otherUserColor,
  points,
  scopeLabel
}: {
  canToggleScope: boolean;
  currentUserColor: string;
  historyScope: HistoryScopeMode;
  maxYen: number;
  onToggleScope: () => void;
  otherUserColor: string;
  points: TrendPoint[];
  scopeLabel: string;
}) {
  const firstMonth = points[0]?.monthKey || null;
  const latestMonth = points[points.length - 1]?.monthKey || null;

  return (
    <Pressable
      accessibilityHint={canToggleScope ? 'Switches History between personal and together spending' : undefined}
      accessibilityLabel={`History trend for ${scopeLabel}`}
      accessibilityRole={canToggleScope ? 'button' : undefined}
      disabled={!canToggleScope}
      onPress={onToggleScope}
      style={({ pressed }) => [pressed && canToggleScope && localStyles.trendCardPressed]}
    >
      <BentoCard style={localStyles.trendCard}>
        <View style={localStyles.trendHead}>
          <View style={localStyles.trendTitleGroup}>
            <View style={localStyles.trendTitleTick} />
            <Text numberOfLines={1} style={localStyles.trendLabel}>MONTHLY TOTAL</Text>
          </View>
          <ScopeIndicator
            currentUserColor={currentUserColor}
            historyScope={historyScope}
            otherUserColor={otherUserColor}
          />
        </View>
        <View style={localStyles.trendBars}>
          {points.map((point) => {
            const heightPercent = maxYen > 0 && point.totalYen > 0
              ? Math.max(8, Math.round((point.totalYen / maxYen) * 100))
              : 8;
            return (
              <View
                key={point.monthKey}
                style={[
                  localStyles.trendBar,
                  {
                    backgroundColor: point.monthKey === latestMonth ? colors.accent : 'rgba(42,39,34,0.20)',
                    opacity: point.totalYen > 0 ? 1 : 0.38,
                    height: `${heightPercent}%`
                  }
                ]}
              />
            );
          })}
        </View>
        <View style={localStyles.trendTicks}>
          <Text style={localStyles.trendTick}>{firstMonth ? formatShortMonthWithYear(firstMonth) : '--'}</Text>
          <Text style={[localStyles.trendTick, localStyles.trendTickCurrent]}>
            {latestMonth ? formatShortMonthWithYear(latestMonth) : '--'}
          </Text>
        </View>
      </BentoCard>
    </Pressable>
  );
}

function ScopeIndicator({
  currentUserColor,
  historyScope,
  otherUserColor
}: {
  currentUserColor: string;
  historyScope: HistoryScopeMode;
  otherUserColor: string;
}) {
  return (
    <View style={localStyles.scopeIndicator}>
      <View style={localStyles.scopeDots}>
        <View style={[localStyles.scopeDot, { backgroundColor: currentUserColor }]} />
        {historyScope === 'together' ? (
          <View style={[localStyles.scopeDot, localStyles.scopeDotOverlap, { backgroundColor: otherUserColor }]} />
        ) : null}
      </View>
      <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.scopeText}>
        {historyScope === 'personal' ? 'ME' : 'TOGETHER'}
      </Text>
    </View>
  );
}

function HistoryLedgerSkeleton() {
  const barHeights = [46, 70, 38, 84, 58, 76];
  const rows = [0, 1, 2, 3];

  return (
    <BentoCard style={localStyles.loadingCard}>
      <View style={localStyles.loadingHeader}>
        <AnimatedSkeletonBlock style={localStyles.loadingTitle} />
        <AnimatedSkeletonBlock style={localStyles.loadingMeta} />
      </View>
      <View style={localStyles.loadingChart}>
        {barHeights.map((height, index) => (
          <AnimatedSkeletonBlock
            key={`${height}-${index}`}
            style={[localStyles.loadingBar, { height }]}
          />
        ))}
      </View>
      <View style={localStyles.loadingRows}>
        {rows.map((row) => (
          <View key={row} style={localStyles.loadingRow}>
            <AnimatedSkeletonBlock style={localStyles.loadingMonth} />
            <AnimatedSkeletonBlock style={localStyles.loadingMix} />
            <AnimatedSkeletonBlock style={localStyles.loadingAmount} />
          </View>
        ))}
      </View>
    </BentoCard>
  );
}

function HistoryRecordsSkeleton() {
  return (
    <View style={localStyles.recordsSkeleton}>
      {[0, 1, 2].map((row) => (
        <View key={row} style={localStyles.recordSkeletonGroup}>
          <AnimatedSkeletonBlock style={localStyles.recordSkeletonHeader} />
          <AnimatedSkeletonBlock style={localStyles.recordSkeletonRow} />
          <AnimatedSkeletonBlock style={localStyles.recordSkeletonRowShort} />
        </View>
      ))}
    </View>
  );
}

function LedgerTable({
  currentMonth,
  groups,
  onOpenMonth
}: {
  currentMonth: string;
  groups: LedgerYearGroup[];
  onOpenMonth: (monthKey: string) => void;
}) {
  return (
    <BentoCard style={localStyles.ledgerTable}>
      <View style={localStyles.ledgerColumnHeader}>
        <Text style={[localStyles.ledgerColumnText, localStyles.monthColumn]}>MONTH</Text>
        <Text style={[localStyles.ledgerColumnText, localStyles.mixColumn]}>CATEGORY MIX</Text>
        <Text style={[localStyles.ledgerColumnText, localStyles.amountColumn]}>TOTAL</Text>
        <View style={localStyles.chevronColumn} />
      </View>

      {groups.map((group) => (
        <View key={group.year}>
          <View style={localStyles.yearBand}>
            <Text style={localStyles.yearLabel}>{group.year}</Text>
            <View style={localStyles.yearSummaryGroup}>
              <SlidingValueText
                fitToWidth
                formatValue={formatYen}
                textStyle={localStyles.yearSummary}
                value={group.totalYen}
                wrapperStyle={localStyles.yearSummaryAmountSlot}
              />
            </View>
          </View>
          {group.months.map((receipt) => (
            <MonthLedgerRow
              current={receipt.monthKey === currentMonth}
              key={receipt.monthKey}
              onPress={() => onOpenMonth(receipt.monthKey)}
              receipt={receipt}
            />
          ))}
        </View>
      ))}
    </BentoCard>
  );
}

function MonthLedgerRow({
  current,
  onPress,
  receipt
}: {
  current: boolean;
  onPress: () => void;
  receipt: MonthlyReceiptStat;
}) {
  const capsules = categoryCapsules(receipt);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        localStyles.monthLedgerRow,
        pressed && localStyles.monthLedgerRowPressed
      ]}
    >
      <Text style={[localStyles.monthCode, current && localStyles.monthCodeCurrent]}>
        {formatMonthAbbreviation(receipt.monthKey).toUpperCase()}
      </Text>
      <View style={localStyles.capsuleRow}>
        {capsules.map((color, index) => (
          <View
            key={`${receipt.monthKey}-${index}`}
            style={[localStyles.capsule, { backgroundColor: color }]}
          />
        ))}
      </View>
      <View style={localStyles.monthAmountBlock}>
        <SlidingValueText
          fitToWidth
          formatValue={formatYen}
          textStyle={localStyles.monthTotal}
          value={receipt.totalYen}
          wrapperStyle={localStyles.monthTotalSlot}
        />
      </View>
      <Ionicons color="#C7BDAE" name="chevron-forward" size={15} style={localStyles.monthChevron} />
    </Pressable>
  );
}

function RecordsHeader({
  error,
  monthKey,
  onBack
}: {
  error: string | null;
  monthKey: string | null;
  onBack: () => void;
}) {
  return (
    <View style={localStyles.recordsHeader}>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [localStyles.backLink, pressed && localStyles.backLinkPressed]}
      >
        <Ionicons color={colors.accent} name="chevron-back" size={22} />
        <Text style={localStyles.backText}>History</Text>
      </Pressable>
      <Text style={localStyles.recordsMonthTitle}>{monthKey ? formatMonthLabel(monthKey) : 'History'}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function SectionHeader({
  collapsed,
  count,
  date,
  onPress,
  totalYen
}: {
  collapsed: boolean;
  count: number;
  date: string;
  onPress: () => void;
  totalYen: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        localStyles.sectionHeader,
        !collapsed && localStyles.sectionHeaderExpanded,
        pressed && localStyles.pressed
      ]}
    >
      <View style={localStyles.sectionDateBlock}>
        <Text style={localStyles.sectionDate}>{formatSectionDate(date)}</Text>
        <Text style={localStyles.sectionWeekday}>
          {formatWeekday(date)}{date === todayDateString() ? ' · TODAY' : ''} · {count} records
        </Text>
      </View>
      <View style={localStyles.sectionTotalBlock}>
        <SlidingValueText
          fitToWidth
          formatValue={formatYen}
          textStyle={localStyles.sectionTotal}
          value={totalYen}
          wrapperStyle={localStyles.sectionTotalSlot}
        />
        <AnimatedChevron color={colors.ink} open={!collapsed} size={18} />
      </View>
    </Pressable>
  );
}

function AnimatedDaySectionCard({
  collapsed,
  expenseBadges,
  onDelete,
  onEdit,
  onSplitBreakdown,
  onToggle,
  onViewDetails,
  section
}: {
  collapsed: boolean;
  expenseBadges: (expense: Expense) => ExpenseBadge[];
  onDelete: (expense: Expense) => void;
  onEdit: (expense: Expense) => void;
  onSplitBreakdown: (item: FilteredExpense) => void;
  onToggle: () => void;
  onViewDetails: (item: FilteredExpense) => void;
  section: HistorySection;
}) {
  const reduceMotion = useReduceMotion();
  const resize = motionCardResizeTransition(reduceMotion);
  const panelIn = motionPanelIn(reduceMotion);
  const panelOut = motionPanelOut(reduceMotion);

  return (
    <Animated.View
      layout={resize}
      style={localStyles.sectionCard}
    >
      <SectionHeader
        collapsed={collapsed}
        count={section.count}
        date={section.date}
        onPress={onToggle}
        totalYen={section.totalYen}
      />

      {!collapsed ? (
        <Animated.View
          entering={panelIn}
          exiting={panelOut}
          layout={resize}
          style={localStyles.sectionDetailStack}
        >
          {section.data.map((item, index) => (
            <SectionDetailRow
              expenseBadges={expenseBadges}
              first={index === 0}
              item={item}
              key={item.expense.id}
              onDelete={onDelete}
              onEdit={onEdit}
              onSplitBreakdown={onSplitBreakdown}
              onViewDetails={onViewDetails}
            />
          ))}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function SectionDetailRow({
  expenseBadges,
  first,
  item,
  onDelete,
  onEdit,
  onSplitBreakdown,
  onViewDetails
}: {
  expenseBadges: (expense: Expense) => ExpenseBadge[];
  first: boolean;
  item: FilteredExpense;
  onDelete: (expense: Expense) => void;
  onEdit: (expense: Expense) => void;
  onSplitBreakdown: (item: FilteredExpense) => void;
  onViewDetails: (item: FilteredExpense) => void;
}) {
  const displayCategory = categoryWithSubcategory(item.expense);
  const resolvedCategory = resolveCategory(item.expense);
  const tagSubtitle = rowSubtitle(item.expense);
  const tagColor = resolvedCategory.subcategory ? categoryColor(resolvedCategory.categoryId) : undefined;

  return (
    <View style={localStyles.sectionDetailSegment}>
      {!first ? <View style={localStyles.detailDivider} /> : null}
      <SwipeExpenseRow
        compact
        content={{
          amount: (
            <SlidingValueText
              fitToWidth
              formatValue={formatYen}
              textStyle={localStyles.rowAmount}
              value={item.displayAmountYen}
              wrapperStyle={localStyles.rowAmountSlot}
            />
          ),
          badges: expenseBadges(item.expense),
          category: displayCategory,
          dateLabel: formatHistoryDate(item.expense.spent_on),
          leadingIcon: categoryIconName(resolvedCategory.categoryId),
          leadingIconColor: categoryColor(resolvedCategory.categoryId),
          subtitle: tagSubtitle,
          subtitleColor: tagColor,
          timeLabel: formatExpenseTime(item.expense),
          title: rowTitle(item.expense)
        }}
        onDelete={() => onDelete(item.expense)}
        onEdit={() => onEdit(item.expense)}
        onSplitBreakdown={() => onSplitBreakdown(item)}
        onViewDetails={() => onViewDetails(item)}
      />
    </View>
  );
}

function buildScopedHistoryItems(expenses: Expense[], viewerUserId: string | null): FilteredExpense[] {
  return expenses
    .map((expense) => ({
      displayAmountYen: viewerUserId ? amountForUser(expense, viewerUserId) : expense.amount_yen,
      expense
    }))
    .filter((item) => item.displayAmountYen > 0);
}

function buildTrendPoints(receipts: MonthlyReceiptStat[]): TrendPoint[] {
  if (receipts.length === 0) {
    return [];
  }

  const visibleMonthCount = receipts.length <= 12
    ? 12
    : receipts.length <= 15
      ? 15
      : 18;
  const newestReceipt = receipts[0];
  const totalsByMonth = new Map(receipts.map((receipt) => [receipt.monthKey, receipt.totalYen]));
  const startMonth = addMonths(newestReceipt.monthKey, -(visibleMonthCount - 1));

  return Array.from({ length: visibleMonthCount }, (_, index) => {
    const monthKey = addMonths(startMonth, index);
    return {
      monthKey,
      totalYen: totalsByMonth.get(monthKey) || 0
    };
  });
}

function categoryCapsules(receipt: MonthlyReceiptStat) {
  const entries = categoryMixEntries(receipt);
  if (receipt.totalYen <= 0 || entries.length === 0) {
    return Array.from({ length: CAPSULE_COUNT }, () => NEUTRAL_CAPSULE_COLOR);
  }

  const total = entries.reduce((sum, entry) => sum + entry.amountYen, 0) || 1;
  const exact = entries.map((entry) => (entry.amountYen / total) * CAPSULE_COUNT);
  const floors = exact.map(Math.floor);
  let used = floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder);

  for (let index = 0; used < CAPSULE_COUNT; index += 1, used += 1) {
    floors[order[index % order.length].index] += 1;
  }

  const output: string[] = [];
  entries.forEach((entry, index) => {
    for (let count = 0; count < floors[index]; count += 1) {
      output.push(entry.color);
    }
  });

  while (output.length < CAPSULE_COUNT) {
    output.push(NEUTRAL_CAPSULE_COLOR);
  }

  return output.slice(0, CAPSULE_COUNT);
}

function categoryMixEntries(receipt: MonthlyReceiptStat): CapsuleEntry[] {
  const rawEntries = PRIMARY_CATEGORIES
    .map((category) => ({
      amountYen: receipt.categoryAmounts[category.id],
      categoryId: category.id,
      color: category.color,
      label: category.label
    }))
    .filter((entry) => entry.amountYen > 0)
    .sort((a, b) => b.amountYen - a.amountYen || a.label.localeCompare(b.label));

  const otherEntry = rawEntries.find((entry) => entry.categoryId === 'other');
  const namedEntries = rawEntries.filter((entry) => entry.categoryId !== 'other');
  const shouldAggregateOther = rawEntries.length > DASHBOARD_CATEGORY_LIMIT;

  if (!shouldAggregateOther) {
    return [
      ...namedEntries,
      ...(otherEntry ? [{ ...otherEntry, color: OTHER_CATEGORY_COLOR }] : [])
    ];
  }

  const visibleNamedEntries = namedEntries.slice(0, DASHBOARD_CATEGORY_LIMIT - 1);
  const aggregateSources = [
    ...namedEntries.slice(DASHBOARD_CATEGORY_LIMIT - 1),
    ...(otherEntry ? [otherEntry] : [])
  ];
  const otherAmount = aggregateSources.reduce((sum, entry) => sum + entry.amountYen, 0);

  return [
    ...visibleNamedEntries,
    ...(otherAmount > 0 ? [{
      amountYen: otherAmount,
      categoryId: 'other' as PrimaryCategoryId,
      color: OTHER_CATEGORY_COLOR,
      label: categoryLabel('other')
    }] : [])
  ];
}

function rowTitle(expense: Expense) {
  const resolvedCategory = resolveCategory(expense);
  return expense.note?.trim() || resolvedCategory.label;
}

function rowSubtitle(expense: Expense) {
  const resolvedCategory = resolveCategory(expense);
  return resolvedCategory.subcategory || undefined;
}

function formatHistoryDate(dateString: string) {
  return fullDateFormatter.format(parseDateString(dateString));
}

function formatSectionDate(dateString: string) {
  return fullDateFormatter.format(parseDateString(dateString)).toUpperCase();
}

function formatWeekday(dateString: string) {
  return weekdayFormatter.format(parseDateString(dateString)).toUpperCase();
}

function formatExpenseTime(expense: Expense) {
  const date = new Date(expense.created_at);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }

  return timeFormatter.format(date);
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${formatHistoryDate(date.toISOString().slice(0, 10))} ${timeFormatter.format(date)}`;
}

function formatMonthAbbreviation(monthKey: string) {
  return monthAbbreviationFormatter.format(parseDateString(`${monthKey}-01`));
}

function formatShortMonthWithYear(monthKey: string) {
  return shortMonthWithYearFormatter.format(parseDateString(`${monthKey}-01`));
}

function parseDateString(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function todayDateString() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isMonthString(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

const localStyles = StyleSheet.create({
  amountColumn: {
    textAlign: 'right',
    width: 76
  },
  backLink: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 2,
    marginBottom: 7
  },
  backLinkPressed: {
    opacity: 0.55
  },
  backText: {
    color: colors.accent,
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20
  },
  capsule: {
    borderRadius: theme.radii.pill,
    flex: 1,
    height: 16,
    minWidth: 0
  },
  capsuleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 2,
    height: 16,
    minWidth: 0
  },
  chevronColumn: {
    width: 10
  },
  detailDivider: {
    backgroundColor: colors.line,
    height: 1,
    marginLeft: 82
  },
  emptyCard: {
    gap: 8,
    padding: 18
  },
  emptyState: {
    gap: 12
  },
  historyTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 30
  },
  ledgerColumnHeader: {
    alignItems: 'center',
    backgroundColor: 'rgba(42,39,34,0.03)',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  ledgerColumnText: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoBold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    lineHeight: 12
  },
  ledgerContent: {
    gap: 13
  },
  ledgerHeader: {
    paddingHorizontal: 4,
    paddingVertical: 4
  },
  ledgerTable: {
    borderRadius: theme.radii.surface,
    overflow: 'hidden',
    padding: 0
  },
  loadingAmount: {
    height: 12,
    width: 72
  },
  loadingBar: {
    alignSelf: 'flex-end',
    borderRadius: 6,
    flex: 1
  },
  loadingCard: {
    gap: 16,
    overflow: 'hidden',
    padding: 18
  },
  loadingChart: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
    height: 92
  },
  loadingHeader: {
    gap: 9
  },
  loadingMeta: {
    height: 12,
    width: 112
  },
  loadingMix: {
    flex: 1,
    height: 12
  },
  loadingMonth: {
    height: 14,
    width: 42
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 34
  },
  loadingRows: {
    gap: 11
  },
  loadingTitle: {
    height: 18,
    width: 180
  },
  mixColumn: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center'
  },
  monthAmountBlock: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    width: 76
  },
  monthChevron: {
    width: 10
  },
  monthCode: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    width: 42
  },
  monthCodeCurrent: {
    color: colors.accent
  },
  monthColumn: {
    width: 42
  },
  monthLedgerRow: {
    alignItems: 'center',
    borderBottomColor: colors.glassBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 18,
    paddingVertical: 11
  },
  monthLedgerRowPressed: {
    backgroundColor: 'rgba(42,39,34,0.04)'
  },
  monthTotal: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'right'
  },
  monthTotalSlot: {
    alignItems: 'flex-end',
    height: 17,
    width: 76
  },
  pressed: {
    opacity: 0.76
  },
  recordsContent: {
    gap: 0
  },
  recordsHeader: {
    gap: 4,
    paddingHorizontal: 4,
    paddingBottom: 10
  },
  recordSkeletonGroup: {
    gap: 8
  },
  recordSkeletonHeader: {
    height: 64,
    width: '100%'
  },
  recordSkeletonRow: {
    height: 68,
    width: '100%'
  },
  recordSkeletonRowShort: {
    height: 54,
    width: '86%'
  },
  recordsSkeleton: {
    gap: 14
  },
  recordsMonthTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 31
  },
  rowAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 24,
    textAlign: 'right'
  },
  rowAmountSlot: {
    alignItems: 'flex-end',
    height: 24,
    width: 118
  },
  scopeDot: {
    borderRadius: 4,
    height: 8,
    width: 8
  },
  scopeDotOverlap: {
    marginLeft: -3
  },
  scopeDots: {
    alignItems: 'center',
    flexDirection: 'row',
    minWidth: 13
  },
  scopeIndicator: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    maxWidth: 128,
    marginLeft: 'auto',
    minWidth: 0
  },
  scopeText: {
    color: colors.muted,
    fontFamily: fontFamilies.monoBold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    lineHeight: 12
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderRadius: theme.radii.surface,
    borderWidth: 1,
    marginBottom: 14,
    marginTop: 8,
    overflow: 'hidden',
    ...theme.daySectionShadow
  },
  sectionDate: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20
  },
  sectionDateBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  sectionDetailSegment: {
    backgroundColor: colors.surface,
    overflow: 'hidden'
  },
  sectionDetailStack: {
    backgroundColor: colors.surface,
    overflow: 'hidden'
  },
  sectionHeader: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 13
  },
  sectionHeaderExpanded: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1
  },
  sectionTotal: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    textAlign: 'right'
  },
  sectionTotalBlock: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6
  },
  sectionTotalSlot: {
    alignItems: 'flex-end',
    height: 24,
    width: 142
  },
  sectionWeekday: {
    color: colors.muted,
    fontFamily: fontFamilies.mono,
    fontSize: 10,
    letterSpacing: 0.5,
    lineHeight: 14
  },
  trendBar: {
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    flex: 1,
    minHeight: 4
  },
  trendBars: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 3,
    height: 46,
    marginTop: 8
  },
  trendCard: {
    borderRadius: theme.radii.surface,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  trendCardPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.995 }]
  },
  trendHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  trendLabel: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    lineHeight: 14,
    minWidth: 0
  },
  trendTitleGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minWidth: 0
  },
  trendTitleTick: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    height: 15,
    width: 5
  },
  trendTick: {
    color: colors.subtle,
    fontFamily: fontFamilies.mono,
    fontSize: 9.5,
    lineHeight: 13
  },
  trendTickCurrent: {
    color: colors.accent
  },
  trendTicks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6
  },
  yearBand: {
    alignItems: 'center',
    backgroundColor: 'rgba(192,137,46,0.07)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 11
  },
  yearLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    lineHeight: 18
  },
  yearSummary: {
    color: colors.muted,
    fontFamily: fontFamilies.mono,
    fontSize: 11,
    lineHeight: 15
  },
  yearSummaryAmountSlot: {
    alignItems: 'flex-end',
    height: 15,
    width: 96
  },
  yearSummaryGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4
  }
});
