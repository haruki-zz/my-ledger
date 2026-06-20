import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { BentoCard, SwipeExpenseRow, type ExpenseBadge } from '@/src/components/ui';
import {
  CategoryList,
  FilterControlButton,
  OptionList,
  type HistoryFilterOption
} from '@/src/components/history/HistoryFilterControls';
import {
  ExpenseDetailModal,
  SplitBreakdownModal,
  type HistoryExpenseItem
} from '@/src/components/history/HistoryExpenseModals';
import { useAuth } from '@/src/context/AuthContext';
import { useLedgerContext } from '@/src/context/LedgerContext';
import { categoryColor, categoryIconName, categoryWithSubcategory, resolveCategory } from '@/src/lib/categorySystem';
import { buildUserColorMap, DEFAULT_USER_COLOR } from '@/src/lib/entityColors';
import { displayName, formatYen } from '@/src/lib/format';
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
  amountForUser,
  buildHistorySummary,
  currentMonthKey,
  expenseCategoryId,
  filterCurrentMonthSettledExpenses,
  formatMonthLabel,
  monthKeyFromDateString
} from '@/src/lib/stats';
import { useHistoryFilters, type HistoryFilterDropdownKey } from '@/src/hooks/useHistoryFilters';
import type { Expense, Ledger, Profile, RecurringExpenseRule } from '@/src/types/database';

type FilteredExpense = HistoryExpenseItem;

type HistorySection = {
  count: number;
  data: FilteredExpense[];
  date: string;
  totalYen: number;
};

type LoadMode = 'background' | 'initial' | 'refresh';

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

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { activeLedger, loading: ledgerLoading } = useLedgerContext();
  const params = useLocalSearchParams<{ date?: string | string[]; month?: string | string[] }>();
  const currentLedger = activeLedger?.ledger || null;
  const activeLedgerId = activeLedger?.ledger.id || null;
  const currentUserId = session?.user.id || null;
  const currentLedgerRef = useRef<Ledger | null>(null);
  const loadInFlightRef = useRef(false);
  const collapseDefaultsMonthRef = useRef<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recurringRules, setRecurringRules] = useState<RecurringExpenseRule[] | null>(null);
  const [activeMemberIds, setActiveMemberIds] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    activeDropdown,
    clearCategories,
    closeDropdown,
    resetFilters,
    selectedCategories,
    selectedUserId,
    selectUser,
    toggleCategory,
    toggleDropdown
  } = useHistoryFilters();
  const selectedMonth = currentMonthKey();
  const sectionListRef = useRef<SectionList<FilteredExpense, HistorySection> | null>(null);
  const scrolledTargetRef = useRef<string | null>(null);
  const consumedTargetParamRef = useRef<string | null>(null);
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
    resetFilters();
    setCollapsedSections(new Set());
    setTargetDate(null);
    setTargetRequestId(0);
    scrolledTargetRef.current = null;
    consumedTargetParamRef.current = null;
    collapseDefaultsMonthRef.current = null;
    setDetailSelection(null);
    setSplitSelection(null);
  }, [activeLedgerId, resetFilters]);

  useEffect(() => {
    const paramDate = firstParam(params.date);
    const targetParamKey = paramDate && isDateString(paramDate) && paramDate.startsWith(`${selectedMonth}-`)
      ? `${selectedMonth}:${paramDate}`
      : null;

    if (targetParamKey && paramDate && consumedTargetParamRef.current !== targetParamKey) {
      consumedTargetParamRef.current = targetParamKey;
      setTargetDate(paramDate);
      setTargetRequestId((current) => current + 1);
      scrolledTargetRef.current = null;
      router.setParams({ date: undefined, month: undefined });
      return;
    }

    if (!paramDate) {
      consumedTargetParamRef.current = null;
    }
  }, [activeLedgerId, params.date, selectedMonth]);

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

  const userOptions = useMemo<HistoryFilterOption[]>(() => (
    sortedUserIds.map((userId) => ({
      label: profileDisplayName(userId),
      value: userId
    }))
  ), [profileDisplayName, sortedUserIds]);

  const categoryOptions = useMemo<HistoryFilterOption[]>(() => (
    [...new Set(settledExpenses.map((expense) => expenseCategoryId(expense)).filter(Boolean))]
      .sort((a, b) => resolveCategory({ categoryId: a }).label.localeCompare(resolveCategory({ categoryId: b }).label))
      .map((categoryId) => ({
        label: resolveCategory({ categoryId }).label,
        value: categoryId
      }))
  ), [settledExpenses]);

  const filteredExpenses = useMemo<FilteredExpense[]>(() => {
    const nextFilteredExpenses: FilteredExpense[] = [];

    for (const expense of settledExpenses) {
      const displayAmountYen = selectedUserId ? amountForUser(expense, selectedUserId) : expense.amount_yen;

      if (selectedUserId && displayAmountYen <= 0) {
        continue;
      }

      if (selectedCategories.size > 0 && !selectedCategories.has(expenseCategoryId(expense))) {
        continue;
      }

      const expenseMonth = monthKeyFromDateString(expense.spent_on);
      if (expenseMonth !== selectedMonth) {
        continue;
      }

      nextFilteredExpenses.push({ displayAmountYen, expense });
    }

    return nextFilteredExpenses.sort((a, b) => (
      b.expense.spent_on.localeCompare(a.expense.spent_on) ||
      b.expense.created_at.localeCompare(a.expense.created_at)
    ));
  }, [selectedCategories, selectedMonth, selectedUserId, settledExpenses]);

  const hasActiveFilters = Boolean(
    selectedUserId ||
    selectedCategories.size > 0
  );

  const historySummary = useMemo(() => buildHistorySummary({
    activeFilterCount: (selectedUserId ? 1 : 0) + selectedCategories.size,
    expenses: filteredExpenses,
    monthKey: selectedMonth
  }), [filteredExpenses, selectedCategories.size, selectedMonth, selectedUserId]);

  const sections = useMemo<HistorySection[]>(() => {
    const sectionMap = new Map<string, FilteredExpense[]>();

    for (const item of filteredExpenses) {
      const existing = sectionMap.get(item.expense.spent_on) || [];
      existing.push(item);
      sectionMap.set(item.expense.spent_on, existing);
    }

    return [...sectionMap.entries()].map(([date, items]) => ({
      count: items.length,
      data: collapsedSections.has(date) ? [] : items,
      date,
      totalYen: items.reduce((sum, item) => sum + item.displayAmountYen, 0)
    }));
  }, [collapsedSections, filteredExpenses]);

  const scrollToTargetSection = useCallback((sectionIndex: number, animated: boolean) => {
    sectionListRef.current?.scrollToLocation({
      animated,
      itemIndex: 0,
      sectionIndex,
      viewOffset: insets.top + 92,
      viewPosition: 0
    });
  }, [insets.top]);

  useEffect(() => {
    if (collapseDefaultsMonthRef.current === selectedMonth) {
      if (targetDate && targetDate.startsWith(`${selectedMonth}-`)) {
        setCollapsedSections((current) => {
          if (!current.has(targetDate)) {
            return current;
          }

          const next = new Set(current);
          next.delete(targetDate);
          return next;
        });
      }
      return;
    }

    const today = todayDateString();
    const targetMonthDate = targetDate && targetDate.startsWith(`${selectedMonth}-`)
      ? targetDate
      : null;
    const monthDates = settledExpenses
      .filter((expense) => monthKeyFromDateString(expense.spent_on) === selectedMonth)
      .map((expense) => expense.spent_on);

    if (monthDates.length === 0) {
      collapseDefaultsMonthRef.current = selectedMonth;
      return;
    }

    const defaultCollapsedDates = new Set(
      monthDates.filter((date) => date !== today && date !== targetMonthDate)
    );

    setCollapsedSections(defaultCollapsedDates);
    collapseDefaultsMonthRef.current = selectedMonth;
  }, [selectedMonth, settledExpenses, targetDate]);

  useEffect(() => {
    if (!targetDate || targetDate.slice(0, 7) !== selectedMonth) {
      return;
    }

    const sectionIndex = sections.findIndex((section) => section.date === targetDate);
    if (sectionIndex < 0) {
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

    const scrollKey = `${activeLedgerId || 'ledger'}:${targetDate}`;
    if (scrolledTargetRef.current === scrollKey) {
      return;
    }

    scrolledTargetRef.current = scrollKey;
    requestAnimationFrame(() => {
      scrollToTargetSection(sectionIndex, true);
    });
  }, [activeLedgerId, collapsedSections, scrollToTargetSection, sections, selectedMonth, targetDate, targetRequestId]);

  function openDropdown(dropdown: HistoryFilterDropdownKey) {
    toggleDropdown(dropdown);
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
    const participantIds = expense.ownership === 'shared' && expense.splits.length > 0
      ? uniqueUserIds(expense.splits.map((split) => split.user_id))
      : [expense.paid_by];

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

  const header = (
    <View style={localStyles.headerContent}>
      <View style={localStyles.monthTitleGroup}>
        <Ionicons color={colors.primaryDark} name="calendar" size={24} />
        <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.monthTitle}>
          {formatMonthLabel(selectedMonth)}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <BentoCard style={localStyles.summaryCard}>
        <View style={localStyles.summaryMetaRow}>
          <Text numberOfLines={1} style={localStyles.summaryLabel}>FILTERED RESULTS</Text>
          <Text numberOfLines={1} style={localStyles.summaryMeta}>{historySummary.dateSpanLabel}</Text>
        </View>

        <View style={localStyles.summaryLeadRow}>
          <View style={localStyles.summaryCountBlock}>
            <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.summaryCount}>
              {historySummary.count}
            </Text>
            <Text numberOfLines={1} style={localStyles.summaryRecords}>records</Text>
          </View>
          <View style={localStyles.summaryTotalBlock}>
            <Text numberOfLines={1} style={localStyles.summarySmallLabel}>TOTAL</Text>
            <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.summarySmallAmount}>
              {formatYen(historySummary.totalYen)}
            </Text>
          </View>
        </View>

        <View style={localStyles.summaryStatsRow}>
          <View style={localStyles.summaryStatTile}>
            <Text numberOfLines={1} style={localStyles.summarySmallLabel}>Avg / day</Text>
            <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.summaryStatValue}>
              {formatYen(historySummary.averagePerDayYen)}
            </Text>
          </View>
          <View style={localStyles.summaryStatTile}>
            <Text numberOfLines={1} style={localStyles.summarySmallLabel}>Peak day</Text>
            <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.summaryStatValue}>
              {historySummary.peakDay.date ? formatYen(historySummary.peakDay.amountYen) : '--'}
            </Text>
          </View>
        </View>

        <View style={localStyles.categoryMixBar}>
          {historySummary.categoryMix.map((segment) => (
            <View
              key={segment.categoryId}
              style={[
                localStyles.categoryMixSegment,
                {
                  backgroundColor: segment.color,
                  flexGrow: segment.amountYen,
                  flexBasis: 0
                }
              ]}
            />
          ))}
          {historySummary.categoryMix.length === 0 ? <View style={localStyles.categoryMixEmpty} /> : null}
        </View>
        <View style={localStyles.categoryCaptionRow}>
          <View
            style={[
              localStyles.categoryCaptionDot,
              { backgroundColor: historySummary.categoryMix[0]?.color || colors.subtle }
            ]}
          />
          <Text numberOfLines={1} style={localStyles.categoryCaption}>
            {historySummary.topCategoryCaption}
          </Text>
        </View>
      </BentoCard>

      <View style={localStyles.filterArea}>
        <View style={localStyles.filterControls}>
          <FilterControlButton
            active={Boolean(selectedUserId)}
            icon="person-outline"
            label={selectedUserId ? profileDisplayName(selectedUserId) : 'User'}
            onPress={() => openDropdown('user')}
          />
          <FilterControlButton
            active={selectedCategories.size > 0}
            icon="pricetag-outline"
            label={selectedCategories.size > 0 ? `Category ${selectedCategories.size}` : 'Category'}
            onPress={() => openDropdown('category')}
          />
        </View>

        {activeDropdown ? (
          <BentoCard style={localStyles.dropdownCard}>
            {activeDropdown === 'user' ? (
              <OptionList
                emptyLabel="All users"
                onChange={selectUser}
                options={userOptions}
                selectedValue={selectedUserId || ''}
              />
            ) : null}
            {activeDropdown === 'category' ? (
              <CategoryList
                onApply={closeDropdown}
                onClear={clearCategories}
                onToggle={toggleCategory}
                options={categoryOptions}
                selectedCategories={selectedCategories}
              />
            ) : null}
          </BentoCard>
        ) : null}

      </View>
    </View>
  );

  return (
    <>
      <SectionList
        ref={sectionListRef}
        ListEmptyComponent={(
          <View style={localStyles.emptyState}>
            {!loading && expenses.length === 0 ? (
              <BentoCard>
                <Text style={styles.h2}>No Expenses Yet</Text>
                <Text style={styles.muted}>Tap the floating add button to create the first record.</Text>
              </BentoCard>
            ) : null}

            {!loading && expenses.length > 0 && filteredExpenses.length === 0 ? (
              <BentoCard>
                <Text style={styles.h2}>No Expenses This Month</Text>
                <Text style={styles.muted}>Switch month or adjust user and category filters.</Text>
                {hasActiveFilters ? (
                  <Pressable onPress={resetFilters} style={[styles.button, styles.secondaryButton]}>
                    <Text style={[styles.buttonText, styles.secondaryButtonText]}>Clear all</Text>
                  </Pressable>
                ) : null}
              </BentoCard>
            ) : null}
          </View>
        )}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.content, localStyles.listContent, { paddingTop: insets.top + 16 }]}
        initialNumToRender={18}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={({ expense }) => expense.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} />}
        onScrollToIndexFailed={() => {
          if (!targetDate || targetDate.slice(0, 7) !== selectedMonth) {
            return;
          }

          const sectionIndex = sections.findIndex((section) => section.date === targetDate);
          if (sectionIndex < 0) {
            return;
          }

          setTimeout(() => scrollToTargetSection(sectionIndex, false), 250);
        }}
        renderItem={({ item, index, section }) => (
          <SectionDetailRow
            expenseBadges={expenseBadges}
            first={index === 0}
            item={item}
            last={index === section.data.length - 1}
            onDelete={(expense) => confirmDelete(expense.id)}
            onEdit={(expense) => router.push(`/expenses/${expense.id}`)}
            onSplitBreakdown={setSplitSelection}
            onViewDetails={setDetailSelection}
          />
        )}
        renderSectionHeader={({ section }) => (
          <SectionHeader
            collapsed={collapsedSections.has(section.date)}
            count={section.count}
            date={section.date}
            onPress={() => toggleSection(section.date)}
            totalYen={section.totalYen}
          />
        )}
        sections={sections}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        style={styles.page}
      />

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
        collapsed ? localStyles.sectionHeaderCollapsed : localStyles.sectionHeaderExpanded,
        pressed && localStyles.pressed
      ]}
    >
      <View style={localStyles.sectionDateBlock}>
        <Text style={localStyles.sectionDate}>{formatSectionDate(date)}</Text>
        <Text style={localStyles.sectionWeekday}>{formatWeekday(date)} · {count} records</Text>
      </View>
      <View style={localStyles.sectionTotalBlock}>
        <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.sectionTotal}>{formatYen(totalYen)}</Text>
        <Ionicons color={colors.ink} name={collapsed ? 'chevron-down' : 'chevron-up'} size={18} />
      </View>
    </Pressable>
  );
}

function SectionDetailRow({
  expenseBadges,
  first,
  item,
  last,
  onDelete,
  onEdit,
  onSplitBreakdown,
  onViewDetails
}: {
  expenseBadges: (expense: Expense) => ExpenseBadge[];
  first: boolean;
  item: FilteredExpense;
  last: boolean;
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
    <View style={[
      localStyles.sectionDetailSegment,
      first && localStyles.sectionDetailSegmentFirst,
      last && localStyles.sectionDetailSegmentLast
    ]}>
      {!first ? <View style={localStyles.detailDivider} /> : null}
      <SwipeExpenseRow
        compact
        content={{
          amount: formatYen(item.displayAmountYen),
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

function uniqueUserIds(userIds: string[]) {
  return [...new Set(userIds.filter(Boolean))];
}

const localStyles = StyleSheet.create({
  categoryCaption: {
    color: colors.muted,
    flex: 1,
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    minWidth: 0
  },
  categoryCaptionDot: {
    borderRadius: 4,
    height: 8,
    width: 8
  },
  categoryCaptionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minWidth: 0
  },
  categoryMixBar: {
    backgroundColor: 'rgba(42,39,34,0.08)',
    borderRadius: 5,
    flexDirection: 'row',
    height: 10,
    overflow: 'hidden',
    width: '100%'
  },
  categoryMixEmpty: {
    backgroundColor: 'rgba(42,39,34,0.10)',
    flex: 1
  },
  categoryMixSegment: {
    minWidth: 2
  },
  dropdownCard: {
    gap: 10,
    padding: 14
  },
  emptyState: {
    gap: 12
  },
  filterArea: {
    gap: 8
  },
  filterControls: {
    flexDirection: 'row',
    gap: 10,
    width: '100%'
  },
  headerContent: {
    gap: 18
  },
  listContent: {
    gap: 0
  },
  monthAnchor: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 54
  },
  monthSwipeArea: {
    gap: 18
  },
  monthTitle: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.monoBold,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 31
  },
  monthTitleGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minWidth: 0,
    width: '100%'
  },
  pressed: {
    opacity: 0.76
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
  detailDivider: {
    backgroundColor: colors.line,
    height: 1,
    marginLeft: 82
  },
  sectionDetailSegment: {
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    overflow: 'hidden'
  },
  sectionDetailSegmentFirst: {
    ...theme.daySectionShadow
  },
  sectionDetailSegmentLast: {
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomWidth: 1,
    marginBottom: 14
  },
  sectionHeader: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 8,
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 13,
    ...theme.daySectionShadow
  },
  sectionHeaderCollapsed: {
    borderRadius: theme.radii.surface,
    marginBottom: 14
  },
  sectionHeaderExpanded: {
    borderTopLeftRadius: theme.radii.surface,
    borderTopRightRadius: theme.radii.surface,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0
  },
  sectionTotal: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    maxWidth: 142,
    textAlign: 'right'
  },
  sectionTotalBlock: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6
  },
  sectionWeekday: {
    color: colors.muted,
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17
  },
  summaryAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 52
  },
  summaryCard: {
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16
  },
  summaryCount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 50
  },
  summaryCountBlock: {
    alignItems: 'baseline',
    flex: 1,
    flexDirection: 'row',
    gap: 9,
    minWidth: 0
  },
  summaryLeadRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 12,
    justifyContent: 'space-between'
  },
  summaryLabel: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    lineHeight: 17,
    textTransform: 'uppercase'
  },
  summaryLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6
  },
  summaryMeta: {
    color: colors.subtle,
    flexShrink: 1,
    fontFamily: fontFamilies.monoBold,
    fontSize: 10.5,
    fontWeight: '700',
    lineHeight: 15,
    minWidth: 0,
    textAlign: 'right'
  },
  summaryMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 10,
    justifyContent: 'space-between',
    minWidth: 0
  },
  summaryRecords: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  summarySmallAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'right'
  },
  summarySmallLabel: {
    color: colors.subtle,
    fontFamily: fontFamilies.bold,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    lineHeight: 14,
    textTransform: 'uppercase'
  },
  summaryStatsRow: {
    flexDirection: 'row',
    gap: 10
  },
  summaryStatTile: {
    backgroundColor: 'rgba(241,236,227,0.68)',
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  summaryStatValue: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  summaryTotalBlock: {
    alignItems: 'flex-end',
    gap: 3,
    minWidth: 116
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between'
  }
});
