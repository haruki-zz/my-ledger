import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { BentoCard, IconButton, SwipeExpenseRow, type ExpenseBadge } from '@/src/components/ui';
import {
  ActiveFilterPill,
  CategoryList,
  FilterControlButton,
  OptionList,
  type ActiveHistoryFilterChip,
  type HistoryFilterOption
} from '@/src/components/history/HistoryFilterControls';
import {
  ExpenseDetailModal,
  SplitBreakdownModal,
  type HistoryExpenseItem
} from '@/src/components/history/HistoryExpenseModals';
import { useLedgerContext } from '@/src/context/LedgerContext';
import { CHART_PALETTE } from '@/src/lib/chartPalette';
import { iconNameForExpenseCategory } from '@/src/lib/categories';
import { displayName, formatYen } from '@/src/lib/format';
import {
  deleteExpense,
  getExpenses,
  getLedgerMembers,
  getProfiles
} from '@/src/lib/ledger';
import { subscribeToLedgerData } from '@/src/lib/localEvents';
import {
  addMonths,
  amountForUser,
  compareMonthKeys,
  formatMonthLabel,
  monthEndDateString,
  monthKeyFromDateString
} from '@/src/lib/stats';
import { useHistoryFilters, type HistoryFilterDropdownKey } from '@/src/hooks/useHistoryFilters';
import type { Expense, Ledger, Profile } from '@/src/types/database';

type FilteredExpense = HistoryExpenseItem;

type HistorySection = {
  count: number;
  data: FilteredExpense[];
  date: string;
  totalYen: number;
};

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
const updatedFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  hour12: false,
  minute: '2-digit'
});

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { activeLedger, loading: ledgerLoading } = useLedgerContext();
  const currentLedger = activeLedger?.ledger || null;
  const activeLedgerId = activeLedger?.ledger.id || null;
  const currentLedgerRef = useRef<Ledger | null>(null);
  const searchInputRef = useRef<TextInput | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activeMemberIds, setActiveMemberIds] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const {
    activeDropdown,
    clearCategories,
    clearSearch,
    closeDropdown,
    debouncedSearchText,
    endMonth,
    filtersOpen,
    resetFilters,
    searchOpen,
    searchText,
    selectedCategories,
    selectedUserId,
    selectEndMonth,
    selectStartMonth,
    selectUser,
    setFiltersOpen,
    setSearchOpen,
    setSearchText,
    startMonth,
    toggleCategory,
    toggleDropdown
  } = useHistoryFilters();
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [detailSelection, setDetailSelection] = useState<FilteredExpense | null>(null);
  const [splitSelection, setSplitSelection] = useState<FilteredExpense | null>(null);

  useEffect(() => {
    currentLedgerRef.current = currentLedger;
  }, [currentLedger]);

  useEffect(() => {
    if (!searchOpen) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 80);

    return () => clearTimeout(timeout);
  }, [searchOpen]);

  const load = useCallback(async () => {
    if (ledgerLoading) {
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const activeLedger = currentLedgerRef.current;
      if (!activeLedger) {
        router.replace('/ledger');
        return;
      }

      const [nextExpenses, nextMembers] = await Promise.all([
        getExpenses(activeLedger.id),
        getLedgerMembers(activeLedger.id)
      ]);
      const profileIds = new Set<string>();
      for (const expense of nextExpenses) {
        profileIds.add(expense.paid_by);
        profileIds.add(expense.recorded_by);
        expense.splits.forEach((split) => profileIds.add(split.user_id));
      }
      nextMembers.forEach((member) => profileIds.add(member.user_id));

      setLedger(activeLedger);
      setExpenses(nextExpenses);
      setActiveMemberIds(new Set(nextMembers.map((member) => member.user_id)));
      setProfiles(await getProfiles([...profileIds]));
      setLastLoadedAt(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load expenses');
    } finally {
      setLoading(false);
    }
  }, [ledgerLoading]);

  useEffect(() => {
    setLedger(null);
    setExpenses([]);
    setProfiles({});
    setActiveMemberIds(new Set());
    resetFilters();
    setCollapsedSections(new Set());
    setDetailSelection(null);
    setSplitSelection(null);
    setLastLoadedAt(null);
  }, [activeLedgerId, resetFilters]);

  useEffect(() => {
    load();
  }, [activeLedgerId, load]);

  const ledgerId = activeLedgerId;

  useEffect(() => {
    if (!ledgerId) {
      return undefined;
    }

    return subscribeToLedgerData(ledgerId, () => {
      void load();
    });
  }, [ledgerId, load]);

  const profileDisplayName = useCallback((userId: string) => {
    const suffix = activeMemberIds.has(userId) ? '' : ' (left)';
    return `${displayName(profiles[userId]?.display_name)}${suffix}`;
  }, [activeMemberIds, profiles]);

  const userOptionIds = useMemo(() => {
    const userIds = new Set<string>();
    activeMemberIds.forEach((userId) => userIds.add(userId));

    for (const expense of expenses) {
      userIds.add(expense.paid_by);
      expense.splits.forEach((split) => userIds.add(split.user_id));
    }

    return [...userIds];
  }, [activeMemberIds, expenses]);

  const sortedUserIds = useMemo(() => (
    [...userOptionIds].sort((a, b) => {
      const nameComparison = profileDisplayName(a).localeCompare(profileDisplayName(b));
      return nameComparison || a.localeCompare(b);
    })
  ), [profileDisplayName, userOptionIds]);

  const userColorById = useMemo(() => {
    const usedPaletteIndexes = new Set<number>();
    const colorsById = new Map<string, string>();

    for (const userId of [...userOptionIds].sort((a, b) => a.localeCompare(b))) {
      let paletteIndex = hashString(userId) % CHART_PALETTE.length;

      for (let attempt = 0; attempt < CHART_PALETTE.length && usedPaletteIndexes.has(paletteIndex); attempt += 1) {
        paletteIndex = (paletteIndex + 1) % CHART_PALETTE.length;
      }

      usedPaletteIndexes.add(paletteIndex);
      colorsById.set(userId, CHART_PALETTE[paletteIndex]);
    }

    return colorsById;
  }, [userOptionIds]);

  const userOptions = useMemo<HistoryFilterOption[]>(() => (
    sortedUserIds.map((userId) => ({
      label: profileDisplayName(userId),
      value: userId
    }))
  ), [profileDisplayName, sortedUserIds]);

  const categoryOptions = useMemo<HistoryFilterOption[]>(() => (
    [...new Set(expenses.map((expense) => expense.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .map((category) => ({
        label: category,
        value: category
      }))
  ), [expenses]);

  const monthOptions = useMemo<HistoryFilterOption[]>(() => {
    if (expenses.length === 0) {
      return [];
    }

    const monthKeys = expenses.map((expense) => monthKeyFromDateString(expense.spent_on));
    const sortedKeys = [...new Set(monthKeys)].sort(compareMonthKeys);
    const firstMonth = sortedKeys[0];
    const lastMonth = sortedKeys[sortedKeys.length - 1];
    const options: HistoryFilterOption[] = [];

    for (
      let monthKey = firstMonth;
      compareMonthKeys(monthKey, lastMonth) <= 0;
      monthKey = addMonths(monthKey, 1)
    ) {
      options.push({
        label: formatMonthLabel(monthKey),
        value: monthKey
      });
    }

    return options;
  }, [expenses]);

  const searchTextByExpenseId = useMemo(() => (
    new Map(expenses.map((expense) => [
      expense.id,
      buildExpenseSearchText(expense, profileDisplayName)
    ]))
  ), [expenses, profileDisplayName]);

  const filteredExpenses = useMemo<FilteredExpense[]>(() => {
    const query = normalizeSearch(debouncedSearchText);
    const nextFilteredExpenses: FilteredExpense[] = [];

    for (const expense of expenses) {
      const displayAmountYen = selectedUserId ? amountForUser(expense, selectedUserId) : expense.amount_yen;

      if (selectedUserId && displayAmountYen <= 0) {
        continue;
      }

      if (selectedCategories.size > 0 && !selectedCategories.has(expense.category)) {
        continue;
      }

      const expenseMonth = monthKeyFromDateString(expense.spent_on);
      if (startMonth && compareMonthKeys(expenseMonth, startMonth) < 0) {
        continue;
      }

      if (endMonth && compareMonthKeys(expenseMonth, endMonth) > 0) {
        continue;
      }

      if (query && !expenseMatchesSearch(searchTextByExpenseId.get(expense.id), displayAmountYen, query)) {
        continue;
      }

      nextFilteredExpenses.push({ displayAmountYen, expense });
    }

    return nextFilteredExpenses.sort((a, b) => (
      b.expense.spent_on.localeCompare(a.expense.spent_on) ||
      b.expense.created_at.localeCompare(a.expense.created_at)
    ));
  }, [debouncedSearchText, endMonth, expenses, searchTextByExpenseId, selectedCategories, selectedUserId, startMonth]);

  const activeFilterChips = useMemo<ActiveHistoryFilterChip[]>(() => {
    const chips: ActiveHistoryFilterChip[] = [];

    if (debouncedSearchText.trim()) {
      chips.push({
        key: 'search',
        label: `Search ${debouncedSearchText.trim()}`,
        onClear: clearSearch
      });
    }

    if (selectedUserId) {
      chips.push({
        key: 'user',
        label: profileDisplayName(selectedUserId),
        onClear: () => selectUser('')
      });
    }

    if (selectedCategories.size > 0) {
      chips.push({
        key: 'category',
        label: selectedCategories.size === 1 ? [...selectedCategories][0] : `Category ${selectedCategories.size}`,
        onClear: clearCategories
      });
    }

    if (startMonth) {
      chips.push({
        key: 'startMonth',
        label: `From ${formatMonthBoundary(startMonth, 'start')}`,
        onClear: () => selectStartMonth('')
      });
    }

    if (endMonth) {
      chips.push({
        key: 'endMonth',
        label: `To ${formatMonthBoundary(endMonth, 'end')}`,
        onClear: () => selectEndMonth('')
      });
    }

    return chips;
  }, [
    clearCategories,
    clearSearch,
    debouncedSearchText,
    endMonth,
    profileDisplayName,
    selectEndMonth,
    selectStartMonth,
    selectUser,
    selectedCategories,
    selectedUserId,
    startMonth
  ]);

  const hasActiveFilters = activeFilterChips.length > 0;

  const total = useMemo(
    () => filteredExpenses.reduce((sum, item) => sum + item.displayAmountYen, 0),
    [filteredExpenses]
  );

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

  function openDropdown(dropdown: HistoryFilterDropdownKey) {
    Keyboard.dismiss();
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
    const ownerAccent = userColorById.get(expense.paid_by) || colors.primary;
    return [
      {
        accent: ownerAccent,
        id: `paid-${expense.paid_by}`,
        label: profileDisplayName(expense.paid_by)
      },
      {
        accent: expense.ownership === 'shared' ? colors.primaryDark : colors.accent,
        id: `ownership-${expense.ownership}`,
        label: expense.ownership === 'shared' ? 'Shared' : 'Personal'
      }
    ];
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
            await load();
          } catch (deleteError) {
            Alert.alert('Delete Failed', deleteError instanceof Error ? deleteError.message : 'Please try again later');
          }
        }
      }
    ]);
  }

  const header = (
    <View style={localStyles.headerContent}>
      <View style={localStyles.topBar}>
        <Pressable onPress={() => router.push('/ledger')} style={localStyles.brandBlock}>
          <View style={localStyles.brandRow}>
            <Ionicons color={colors.primaryDark} name="book" size={24} />
            <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.brandTitle}>My Ledger</Text>
          </View>
          <View style={localStyles.ledgerRow}>
            <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.ledgerKicker}>
              {ledger ? ledger.name : 'Shared Ledger'}
            </Text>
            <Ionicons color={colors.muted} name="chevron-down" size={16} />
          </View>
        </Pressable>

        <View style={localStyles.headerActions}>
          <IconButton
            accessibilityLabel={searchOpen ? 'Close search' : 'Open search'}
            icon={searchOpen ? 'close' : 'search'}
            onPress={() => {
              setSearchOpen(!searchOpen);
            }}
            size="lg"
            tone="neutral"
          />
          <IconButton
            accessibilityLabel={filtersOpen ? 'Hide filters' : 'Show filters'}
            icon="options-outline"
            onPress={() => {
              setFiltersOpen(!filtersOpen);
            }}
            size="lg"
            tone={filtersOpen ? 'primary' : 'neutral'}
          />
        </View>
      </View>

      {searchOpen ? (
        <View style={localStyles.searchShell}>
          <Ionicons color={colors.muted} name="search" size={19} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={setSearchText}
            placeholder="Search records"
            placeholderTextColor={colors.subtle}
            ref={searchInputRef}
            returnKeyType="search"
            style={localStyles.searchInput}
            value={searchText}
          />
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <BentoCard style={localStyles.summaryCard}>
        <View style={localStyles.summaryMainRow}>
          <View style={localStyles.summaryTotalBlock}>
            <View style={localStyles.summaryLabelRow}>
              <Text style={localStyles.summaryLabel}>Filtered Total</Text>
              <Ionicons color={colors.muted} name="information-circle-outline" size={17} />
            </View>
            <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.summaryAmount}>
              {formatYen(total)}
            </Text>
            <View style={localStyles.updatedRow}>
              <Ionicons color={colors.primaryDark} name="arrow-down" size={17} />
              <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.updatedText}>
                Across current filters
              </Text>
            </View>
          </View>

          <View style={localStyles.summaryDivider} />

          <View style={localStyles.summaryRecordsBlock}>
            <Text style={localStyles.summaryLabel}>Records</Text>
            <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.recordCount}>
              {filteredExpenses.length}
            </Text>
            <View style={localStyles.updatedRow}>
              <View style={localStyles.updatedDot} />
              <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.updatedText}>
                {formatUpdatedStatus(lastLoadedAt)}
              </Text>
            </View>
          </View>
        </View>

        <View style={localStyles.activeFilterHeader}>
          <Text style={localStyles.summaryLabel}>Active Filters</Text>
          {hasActiveFilters ? (
            <Pressable onPress={resetFilters}>
              <Text style={localStyles.clearAllText}>Clear all</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          contentContainerStyle={localStyles.activeFilterChips}
          directionalLockEnabled
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
        >
          {activeFilterChips.length > 0 ? activeFilterChips.map((chip) => (
            <ActiveFilterPill key={chip.key} label={chip.label} onClear={chip.onClear} />
          )) : (
            <Text style={localStyles.noFiltersText}>None</Text>
          )}
        </ScrollView>
      </BentoCard>

      {filtersOpen ? (
        <View style={localStyles.filterArea}>
          <ScrollView
            contentContainerStyle={localStyles.filterControls}
            directionalLockEnabled
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
          >
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
            <FilterControlButton
              active={Boolean(startMonth)}
              icon="calendar-outline"
              label={startMonth ? formatMonthBoundary(startMonth, 'start') : 'From'}
              onPress={() => openDropdown('startMonth')}
            />
            <FilterControlButton
              active={Boolean(endMonth)}
              icon="calendar-outline"
              label={endMonth ? formatMonthBoundary(endMonth, 'end') : 'To'}
              onPress={() => openDropdown('endMonth')}
            />
          </ScrollView>

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
              {activeDropdown === 'startMonth' ? (
                <OptionList
                  emptyLabel="Any start"
                  onChange={selectStartMonth}
                  options={monthOptions}
                  selectedValue={startMonth || ''}
                />
              ) : null}
              {activeDropdown === 'endMonth' ? (
                <OptionList
                  emptyLabel="Any end"
                  onChange={selectEndMonth}
                  options={monthOptions}
                  selectedValue={endMonth || ''}
                />
              ) : null}
            </BentoCard>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <SectionList
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
                <Text style={styles.h2}>No Matching Expenses</Text>
                <Text style={styles.muted}>Adjust the filters or search to show more records.</Text>
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
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        renderItem={({ item }) => (
          <View style={localStyles.rowWrapper}>
            <SwipeExpenseRow
              compact
              content={{
                amount: formatYen(item.displayAmountYen),
                badges: expenseBadges(item.expense),
                category: item.expense.category,
                dateLabel: formatHistoryDate(item.expense.spent_on),
                leadingIcon: iconNameForExpenseCategory(item.expense.category),
                leadingIconColor: colorForCategory(item.expense.category),
                subtitle: rowSubtitle(item.expense),
                timeLabel: formatExpenseTime(item.expense),
                title: rowTitle(item.expense)
              }}
              onDelete={() => confirmDelete(item.expense.id)}
              onEdit={() => router.push(`/expenses/${item.expense.id}`)}
              onSplitBreakdown={() => setSplitSelection(item)}
              onViewDetails={() => setDetailSelection(item)}
            />
          </View>
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
    <Pressable onPress={onPress} style={({ pressed }) => [localStyles.sectionHeader, pressed && localStyles.pressed]}>
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

function buildExpenseSearchText(
  expense: Expense,
  profileDisplayName: (userId: string) => string
) {
  const splitNames = expense.splits.map((split) => profileDisplayName(split.user_id));
  return normalizeSearch([
    expense.note || '',
    expense.category,
    expense.spent_on,
    expense.amount_yen,
    formatYen(expense.amount_yen),
    expense.ownership,
    profileDisplayName(expense.paid_by),
    profileDisplayName(expense.recorded_by),
    ...splitNames
  ].join(' '));
}

function expenseMatchesSearch(
  indexedSearchText: string | undefined,
  displayAmountYen: number,
  normalizedQuery: string
) {
  const displayAmountSearchText = normalizeSearch(`${displayAmountYen} ${formatYen(displayAmountYen)}`);

  return Boolean(indexedSearchText?.includes(normalizedQuery) || displayAmountSearchText.includes(normalizedQuery));
}

function normalizeSearch(value: unknown) {
  return String(value).toLowerCase().replace(/[¥,\s]/g, '');
}

function rowTitle(expense: Expense) {
  return expense.note?.trim() || expense.category;
}

function rowSubtitle(expense: Expense) {
  return expense.note?.trim() ? expense.category : expense.ownership === 'shared' ? 'Shared expense' : 'Personal expense';
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

function formatUpdatedStatus(value: Date | null) {
  if (!value) {
    return 'Updating...';
  }

  if (Date.now() - value.getTime() < 60_000) {
    return 'Updated just now';
  }

  return `Updated ${updatedFormatter.format(value)}`;
}

function formatMonthBoundary(monthKey: string, boundary: 'start' | 'end') {
  const dateString = boundary === 'start' ? `${monthKey}-01` : monthEndDateString(monthKey);
  return dateString.replaceAll('-', '/');
}

function parseDateString(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function colorForCategory(category: string) {
  return CHART_PALETTE[hashString(category) % CHART_PALETTE.length] || colors.primaryDark;
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash);
}

const localStyles = StyleSheet.create({
  activeFilterChips: {
    alignItems: 'center',
    gap: 8,
    minHeight: 32,
    paddingRight: 18
  },
  activeFilterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  brandBlock: {
    flex: 1,
    gap: 5,
    minWidth: 0
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minWidth: 0
  },
  brandTitle: {
    color: colors.primaryDark,
    flexShrink: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 31
  },
  clearAllText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.bold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18
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
    gap: 10,
    paddingRight: 20
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12
  },
  headerContent: {
    gap: 18
  },
  ledgerKicker: {
    color: colors.ink,
    flexShrink: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 20
  },
  ledgerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingLeft: 36
  },
  listContent: {
    gap: 10
  },
  noFiltersText: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18
  },
  pressed: {
    opacity: 0.76
  },
  recordCount: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 38
  },
  rowWrapper: {
    marginTop: 0
  },
  searchInput: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    minWidth: 0,
    paddingVertical: 0
  },
  searchShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 14
  },
  sectionDate: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20
  },
  sectionDateBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  sectionHeader: {
    alignItems: 'center',
    backgroundColor: colors.glass,
    borderColor: colors.glassBorder,
    borderRadius: theme.radii.surface,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 4,
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...theme.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 16
  },
  sectionTotal: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
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
    fontFamily: fontFamilies.bold,
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 52
  },
  summaryCard: {
    gap: 18,
    paddingHorizontal: 22,
    paddingVertical: 20
  },
  summaryDivider: {
    alignSelf: 'stretch',
    backgroundColor: colors.line,
    width: 1
  },
  summaryLabel: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.3,
    lineHeight: 17,
    textTransform: 'uppercase'
  },
  summaryLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6
  },
  summaryMainRow: {
    flexDirection: 'row',
    gap: 22
  },
  summaryRecordsBlock: {
    gap: 14,
    minWidth: 110
  },
  summaryTotalBlock: {
    flex: 1,
    gap: 8,
    minWidth: 0
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between'
  },
  updatedDot: {
    backgroundColor: colors.primaryDark,
    borderRadius: 4,
    height: 8,
    width: 8
  },
  updatedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minHeight: 20
  },
  updatedText: {
    color: colors.muted,
    flexShrink: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17
  }
});
