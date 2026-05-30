import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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
  type StyleProp,
  type ViewStyle
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamilies, styles } from '@/src/components/styles';
import { BentoCard, FilterChip, SwipeExpenseRow } from '@/src/components/ui';
import { useLedgerContext } from '@/src/context/LedgerContext';
import { displayName, formatYen } from '@/src/lib/format';
import {
  deleteExpense,
  getExpenses,
  getLedgerMembers,
  getProfiles
} from '@/src/lib/ledger';
import {
  addMonths,
  amountForUser,
  compareMonthKeys,
  formatMonthLabel,
  monthKeyFromDateString
} from '@/src/lib/stats';
import { supabase } from '@/src/lib/supabase';
import type { Expense, Ledger, Profile } from '@/src/types/database';

type FilterDropdownKey = 'user' | 'category' | 'startMonth' | 'endMonth';

type FilterOption = {
  label: string;
  value: string;
};

type FilteredExpense = {
  displayAmountYen: number;
  expense: Expense;
};

let realtimeSubscriptionSequence = 0;
const historyDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short'
});
const shortMonthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: '2-digit'
});

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { activeLedger, loading: ledgerLoading } = useLedgerContext();
  const currentLedger = activeLedger?.ledger || null;
  const activeLedgerId = activeLedger?.ledger.id || null;
  const currentLedgerRef = useRef<Ledger | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activeMemberIds, setActiveMemberIds] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [startMonth, setStartMonth] = useState<string | null>(null);
  const [endMonth, setEndMonth] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<FilterDropdownKey | null>(null);

  useEffect(() => {
    currentLedgerRef.current = currentLedger;
  }, [currentLedger]);

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
      const profileIds = nextExpenses.flatMap((expense) => [
        expense.paid_by,
        expense.recorded_by,
        ...expense.splits.map((split) => split.user_id)
      ]);

      setLedger(activeLedger);
      setExpenses(nextExpenses);
      setActiveMemberIds(new Set(nextMembers.map((member) => member.user_id)));
      setProfiles(await getProfiles([...profileIds, ...nextMembers.map((member) => member.user_id)]));
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
    setSelectedUserId(null);
    setSelectedCategory(null);
    setStartMonth(null);
    setEndMonth(null);
    setActiveDropdown(null);
  }, [activeLedgerId]);

  useEffect(() => {
    load();
  }, [activeLedgerId, load]);

  const ledgerId = activeLedgerId;

  useEffect(() => {
    if (!ledgerId) {
      return undefined;
    }

    const subscriptionId = ++realtimeSubscriptionSequence;
    const channel = supabase
      .channel(`ledger-history-${ledgerId}-${subscriptionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expenses',
          filter: `ledger_id=eq.${ledgerId}`
        },
        () => {
          load();
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
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

  const userOptions = useMemo<FilterOption[]>(() => (
    [...userOptionIds]
      .sort((a, b) => profileDisplayName(a).localeCompare(profileDisplayName(b)))
      .map((userId) => ({
        label: profileDisplayName(userId),
        value: userId
      }))
  ), [profileDisplayName, userOptionIds]);

  const categoryOptions = useMemo<FilterOption[]>(() => (
    [...new Set(expenses.map((expense) => expense.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .map((category) => ({
        label: category,
        value: category
      }))
  ), [expenses]);

  const monthOptions = useMemo<FilterOption[]>(() => {
    if (expenses.length === 0) {
      return [];
    }

    const monthKeys = expenses.map((expense) => monthKeyFromDateString(expense.spent_on));
    const sortedKeys = [...new Set(monthKeys)].sort(compareMonthKeys);
    const firstMonth = sortedKeys[0];
    const lastMonth = sortedKeys[sortedKeys.length - 1];
    const options: FilterOption[] = [];

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

  const filteredExpenses = useMemo<FilteredExpense[]>(() => {
    const nextFilteredExpenses: FilteredExpense[] = [];

    for (const expense of expenses) {
      const displayAmountYen = selectedUserId ? amountForUser(expense, selectedUserId) : expense.amount_yen;

      if (selectedUserId && displayAmountYen <= 0) {
        continue;
      }

      if (selectedCategory && expense.category !== selectedCategory) {
        continue;
      }

      const expenseMonth = monthKeyFromDateString(expense.spent_on);
      if (startMonth && compareMonthKeys(expenseMonth, startMonth) < 0) {
        continue;
      }

      if (endMonth && compareMonthKeys(expenseMonth, endMonth) > 0) {
        continue;
      }

      nextFilteredExpenses.push({ displayAmountYen, expense });
    }

    return nextFilteredExpenses;
  }, [endMonth, expenses, selectedCategory, selectedUserId, startMonth]);

  const activeFilterCount = [selectedUserId, selectedCategory, startMonth, endMonth].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;

  const total = useMemo(
    () => filteredExpenses.reduce((sum, item) => sum + item.displayAmountYen, 0),
    [filteredExpenses]
  );

  function toggleDropdown(dropdown: FilterDropdownKey) {
    setActiveDropdown((current) => (current === dropdown ? null : dropdown));
  }

  function selectUser(value: string) {
    setSelectedUserId(value || null);
    setActiveDropdown(null);
  }

  function selectCategory(value: string) {
    setSelectedCategory(value || null);
    setActiveDropdown(null);
  }

  function selectStartMonth(value: string) {
    const nextStartMonth = value || null;
    setStartMonth(nextStartMonth);

    if (nextStartMonth && endMonth && compareMonthKeys(nextStartMonth, endMonth) > 0) {
      setEndMonth(nextStartMonth);
    }

    setActiveDropdown(null);
  }

  function selectEndMonth(value: string) {
    const nextEndMonth = value || null;
    setEndMonth(nextEndMonth);

    if (nextEndMonth && startMonth && compareMonthKeys(nextEndMonth, startMonth) < 0) {
      setStartMonth(nextEndMonth);
    }

    setActiveDropdown(null);
  }

  function resetFilters() {
    setSelectedUserId(null);
    setSelectedCategory(null);
    setStartMonth(null);
    setEndMonth(null);
    setActiveDropdown(null);
  }

  function clearFilter(filter: FilterDropdownKey) {
    if (filter === 'user') {
      setSelectedUserId(null);
    }

    if (filter === 'category') {
      setSelectedCategory(null);
    }

    if (filter === 'startMonth') {
      setStartMonth(null);
    }

    if (filter === 'endMonth') {
      setEndMonth(null);
    }

    setActiveDropdown((current) => (current === filter ? null : current));
  }

  function filterChipLabel(filter: FilterDropdownKey) {
    if (filter === 'user') {
      return selectedUserId ? profileDisplayName(selectedUserId) : 'User';
    }

    if (filter === 'category') {
      return selectedCategory || 'Category';
    }

    if (filter === 'startMonth') {
      return startMonth ? formatShortMonthLabel(startMonth) : 'From';
    }

    return endMonth ? formatShortMonthLabel(endMonth) : 'To';
  }

  function filterActive(filter: FilterDropdownKey) {
    if (filter === 'user') {
      return Boolean(selectedUserId);
    }

    if (filter === 'category') {
      return Boolean(selectedCategory);
    }

    if (filter === 'startMonth') {
      return Boolean(startMonth);
    }

    return Boolean(endMonth);
  }

  function pressFilter(filter: FilterDropdownKey) {
    if (filterActive(filter)) {
      clearFilter(filter);
      return;
    }

    toggleDropdown(filter);
  }

  async function confirmDelete(expenseId: string) {
    Alert.alert('Delete Expense', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteExpense(expenseId);
            await load();
          } catch (deleteError) {
            Alert.alert('Delete Failed', deleteError instanceof Error ? deleteError.message : 'Please try again later');
          }
        }
      }
    ]);
  }

  const filterKeys: FilterDropdownKey[] = ['user', 'category', 'startMonth', 'endMonth'];

  const header = (
    <View style={localStyles.headerContent}>
      <View>
        <Text style={localStyles.ledgerKicker}>{ledger ? ledger.name : 'Shared Ledger'}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <BentoCard style={localStyles.summaryStrip}>
        <View style={localStyles.summaryText}>
          <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.summaryAmount}>{formatYen(total)}</Text>
          <Text style={localStyles.summaryCount}>{filteredExpenses.length} records</Text>
        </View>
        <Ionicons color="rgba(15,118,110,0.42)" name="receipt-outline" size={30} />
      </BentoCard>

      <ScrollView
        contentContainerStyle={localStyles.filterChips}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
      >
        {filterKeys.map((item) => (
          <FilterChip
            active={filterActive(item)}
            key={item}
            label={filterChipLabel(item)}
            onPress={() => pressFilter(item)}
          />
        ))}
      </ScrollView>

      {activeDropdown ? (
        <BentoCard style={localStyles.dropdownCard}>
          {activeDropdown === 'user' ? (
            <FilterDropdown
              active
              label="User"
              onChange={selectUser}
              onToggle={() => toggleDropdown('user')}
              options={[{ label: 'All users', value: '' }, ...userOptions]}
              selectedValue={selectedUserId || ''}
            />
          ) : null}
          {activeDropdown === 'category' ? (
            <FilterDropdown
              active
              label="Category"
              onChange={selectCategory}
              onToggle={() => toggleDropdown('category')}
              options={[{ label: 'All categories', value: '' }, ...categoryOptions]}
              selectedValue={selectedCategory || ''}
            />
          ) : null}
          {activeDropdown === 'startMonth' ? (
            <FilterDropdown
              active
              label="From"
              onChange={selectStartMonth}
              onToggle={() => toggleDropdown('startMonth')}
              options={[{ label: 'Any start', value: '' }, ...monthOptions]}
              selectedValue={startMonth || ''}
            />
          ) : null}
          {activeDropdown === 'endMonth' ? (
            <FilterDropdown
              active
              label="To"
              onChange={selectEndMonth}
              onToggle={() => toggleDropdown('endMonth')}
              options={[{ label: 'Any end', value: '' }, ...monthOptions]}
              selectedValue={endMonth || ''}
            />
          ) : null}
        </BentoCard>
      ) : null}
    </View>
  );

  return (
    <FlatList
      ListEmptyComponent={(
        <View style={localStyles.emptyState}>
          {!loading && expenses.length === 0 ? (
            <BentoCard>
              <Text style={styles.h2}>No Expenses Yet</Text>
              <Text style={styles.muted}>Tap the floating add button to create the first Supabase-backed record.</Text>
            </BentoCard>
          ) : null}

          {!loading && expenses.length > 0 && filteredExpenses.length === 0 ? (
            <BentoCard>
              <Text style={styles.h2}>No Matching Expenses</Text>
              <Text style={styles.muted}>Adjust or reset the filters to show more records.</Text>
              {hasActiveFilters ? (
                <Pressable onPress={resetFilters} style={[styles.button, styles.secondaryButton]}>
                  <Text style={[styles.buttonText, styles.secondaryButtonText]}>Reset Filters</Text>
                </Pressable>
              ) : null}
            </BentoCard>
          ) : null}
        </View>
      )}
      ListHeaderComponent={header}
      contentContainerStyle={[styles.content, localStyles.listContent, { paddingTop: insets.top + 16 }]}
      data={filteredExpenses}
      keyExtractor={({ expense }) => expense.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      style={styles.page}
      renderItem={({ item }) => (
        <SwipeExpenseRow
          amount={formatYen(item.displayAmountYen)}
          badgeLabel={item.expense.ownership === 'shared' ? 'Shared' : 'Personal'}
          badgeTone={item.expense.ownership === 'shared' ? 'shared' : 'personal'}
          category={item.expense.category}
          meta={`${formatHistoryDate(item.expense.spent_on)} · Paid by ${profileDisplayName(item.expense.paid_by)}`}
          onDelete={() => confirmDelete(item.expense.id)}
          onEdit={() => router.push(`/expenses/${item.expense.id}`)}
        />
      )}
      showsVerticalScrollIndicator={false}
    />
  );
}

function formatHistoryDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  return historyDateFormatter.format(date);
}

function formatShortMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return shortMonthFormatter.format(new Date(year, month - 1, 1));
}

type FilterDropdownProps = {
  active: boolean;
  label: string;
  onChange: (value: string) => void;
  onToggle: () => void;
  options: FilterOption[];
  selectedValue: string;
  style?: StyleProp<ViewStyle>;
};

function FilterDropdown({
  active,
  label,
  onChange,
  onToggle,
  options,
  selectedValue,
  style
}: FilterDropdownProps) {
  const selectedOption = options.find((option) => option.value === selectedValue) || options[0];

  return (
    <View style={[localStyles.filterField, style]}>
      <Text style={styles.upperLabel}>{label}</Text>
      <View style={styles.dropdown}>
        <Pressable
          onPress={onToggle}
          style={[styles.dropdownTrigger, active && styles.dropdownTriggerActive]}
        >
          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.dropdownValue}>
            {selectedOption?.label || 'Any'}
          </Text>
          <Text style={styles.dropdownIndicator}>{active ? '⌃' : '⌄'}</Text>
        </Pressable>

        {active ? (
          <View style={[styles.dropdownMenu, localStyles.dropdownMenu]}>
            <ScrollView nestedScrollEnabled style={localStyles.dropdownMenuScroll}>
              {options.map((option) => {
                const selected = option.value === selectedValue;
                return (
                  <Pressable
                    key={option.value || `${label}-all`}
                    onPress={() => onChange(option.value)}
                    style={[styles.dropdownOption, selected && styles.dropdownOptionActive]}
                  >
                    <Text
                      ellipsizeMode="tail"
                      numberOfLines={1}
                      style={[styles.dropdownOptionText, selected && styles.dropdownOptionTextActive]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  dropdownCard: {
    gap: 10,
    padding: 14
  },
  dropdownMenu: {
    maxHeight: 228
  },
  dropdownMenuScroll: {
    maxHeight: 228
  },
  emptyState: {
    gap: 12
  },
  filterChips: {
    gap: 10,
    paddingRight: 20
  },
  filterField: {
    gap: 8
  },
  headerContent: {
    gap: 18
  },
  ledgerKicker: {
    color: colors.muted,
    fontFamily: fontFamilies.extraBold,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24
  },
  listContent: {
    gap: 16
  },
  summaryAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 46
  },
  summaryCount: {
    color: colors.muted,
    fontFamily: fontFamilies.extraBold,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22
  },
  summaryStrip: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 106,
    paddingHorizontal: 24,
    paddingVertical: 18
  },
  summaryText: {
    flex: 1,
    minWidth: 0
  }
});
