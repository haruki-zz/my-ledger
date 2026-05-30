import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle
} from 'react-native';

import { colors, fontFamilies, styles } from '@/src/components/styles';
import { BentoCard, MetricTile } from '@/src/components/ui';
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

export default function HistoryScreen() {
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
  const [filtersExpanded, setFiltersExpanded] = useState(false);

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
    setFiltersExpanded(false);
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

  function toggleFilters() {
    if (filtersExpanded) {
      setActiveDropdown(null);
    }

    setFiltersExpanded((current) => !current);
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

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      style={styles.page}
      contentContainerStyle={styles.content}
    >
      <View>
        <Text style={styles.title}>Expense History</Text>
        <Text style={styles.muted}>{ledger ? ledger.name : 'Shared Ledger'}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <BentoCard variant="hero" style={{ minHeight: 0 }}>
        <MetricTile
          helper={`${filteredExpenses.length} records`}
          icon="receipt-outline"
          label="Total"
          value={formatYen(total)}
        />
      </BentoCard>

      <BentoCard style={localStyles.filterCard}>
        <View style={localStyles.filterHeader}>
          <Pressable
            accessibilityLabel={filtersExpanded ? 'Collapse filters' : 'Expand filters'}
            accessibilityRole="button"
            onPress={toggleFilters}
            style={({ pressed }) => [
              localStyles.filterToggle,
              pressed && localStyles.filterTogglePressed
            ]}
          >
            <View style={localStyles.filterToggleText}>
              <Text style={styles.h2}>Filters</Text>
              <Text style={styles.muted}>{activeFilterCount > 0 ? `${activeFilterCount} active` : 'No filters'}</Text>
            </View>
            <Ionicons color={colors.subtle} name={filtersExpanded ? 'chevron-up' : 'chevron-down'} size={20} />
          </Pressable>

          {hasActiveFilters ? (
            <Pressable onPress={resetFilters} style={[styles.button, styles.secondaryButton, localStyles.resetButton]}>
              <Text style={[styles.buttonText, styles.secondaryButtonText, localStyles.resetButtonText]}>Reset</Text>
            </Pressable>
          ) : null}
        </View>

        {filtersExpanded ? (
          <View style={localStyles.filterGrid}>
            <FilterDropdown
              active={activeDropdown === 'user'}
              label="User"
              onChange={selectUser}
              onToggle={() => toggleDropdown('user')}
              options={[{ label: 'All users', value: '' }, ...userOptions]}
              selectedValue={selectedUserId || ''}
            />

            <FilterDropdown
              active={activeDropdown === 'category'}
              label="Category"
              onChange={selectCategory}
              onToggle={() => toggleDropdown('category')}
              options={[{ label: 'All categories', value: '' }, ...categoryOptions]}
              selectedValue={selectedCategory || ''}
            />

            <FilterDropdown
              active={activeDropdown === 'startMonth'}
              label="From"
              onChange={selectStartMonth}
              onToggle={() => toggleDropdown('startMonth')}
              options={[{ label: 'Any start', value: '' }, ...monthOptions]}
              selectedValue={startMonth || ''}
            />

            <FilterDropdown
              active={activeDropdown === 'endMonth'}
              label="To"
              onChange={selectEndMonth}
              onToggle={() => toggleDropdown('endMonth')}
              options={[{ label: 'Any end', value: '' }, ...monthOptions]}
              selectedValue={endMonth || ''}
            />
          </View>
        ) : null}
      </BentoCard>

      <View style={{ gap: 12 }}>
        {filteredExpenses.map(({ displayAmountYen, expense }) => (
          <BentoCard key={expense.id} variant="list">
            <View style={styles.between}>
              <View style={{ flex: 1 }}>
                <Text style={styles.h2}>{expense.category}</Text>
                <Text style={styles.muted}>
                  {expense.spent_on} · {expense.ownership === 'shared' ? 'Shared expense' : 'Personal expense'}
                </Text>
              </View>
              <Text style={{ color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 20, fontWeight: '900' }}>
                {formatYen(displayAmountYen)}
              </Text>
            </View>

            <View style={{ gap: 4 }}>
              <Text style={styles.muted}>Paid by: {profileDisplayName(expense.paid_by)}</Text>
              <Text style={styles.muted}>Recorded by: {profileDisplayName(expense.recorded_by)}</Text>
              {expense.note ? <Text style={styles.body}>{expense.note}</Text> : null}
            </View>

            {expense.splits.length > 0 ? (
              <View style={{ gap: 4 }}>
                {expense.splits.map((split) => (
                  <Text key={split.user_id} style={styles.muted}>
                    {profileDisplayName(split.user_id)} owes {formatYen(split.amount_yen)}
                  </Text>
                ))}
              </View>
            ) : null}

            <View style={styles.row}>
              <Pressable
                onPress={() => router.push(`/expenses/${expense.id}`)}
                style={[styles.button, styles.secondaryButton, { flex: 1 }]}
              >
                <Text style={[styles.buttonText, styles.secondaryButtonText]}>Edit</Text>
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(expense.id)}
                style={[styles.button, styles.dangerButton, { flex: 1 }]}
              >
                <Text style={styles.buttonText}>Delete</Text>
              </Pressable>
            </View>
          </BentoCard>
        ))}
      </View>

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
    </ScrollView>
  );
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
      <Text style={styles.label}>{label}</Text>
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
  dropdownMenu: {
    maxHeight: 228
  },
  dropdownMenuScroll: {
    maxHeight: 228
  },
  filterCard: {
    gap: 14
  },
  filterField: {
    flex: 1,
    gap: 6,
    minWidth: 178
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  filterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  filterToggle: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 4
  },
  filterTogglePressed: {
    opacity: 0.72
  },
  filterToggleText: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  resetButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  resetButtonText: {
    fontSize: 14
  }
});
