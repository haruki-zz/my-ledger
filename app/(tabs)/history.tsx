import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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
  amountForUser,
  compareMonthKeys,
  currentMonthKey,
  formatMonthLabel,
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
export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { activeLedger, loading: ledgerLoading } = useLedgerContext();
  const currentLedger = activeLedger?.ledger || null;
  const activeLedgerId = activeLedger?.ledger.id || null;
  const currentUserId = session?.user.id || null;
  const currentLedgerRef = useRef<Ledger | null>(null);
  const collapseDefaultsMonthRef = useRef<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activeMemberIds, setActiveMemberIds] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const {
    activeDropdown,
    clearCategories,
    closeDropdown,
    resetFilters,
    selectedCategories,
    selectedMonth,
    selectedUserId,
    selectMonth,
    selectUser,
    toggleCategory,
    toggleDropdown
  } = useHistoryFilters();
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [detailSelection, setDetailSelection] = useState<FilteredExpense | null>(null);
  const [splitSelection, setSplitSelection] = useState<FilteredExpense | null>(null);

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
      const profileIds = new Set<string>();
      for (const expense of nextExpenses) {
        profileIds.add(expense.paid_by);
        profileIds.add(expense.recorded_by);
        expense.splits.forEach((split) => profileIds.add(split.user_id));
      }
      nextMembers.forEach((member) => profileIds.add(member.user_id));

      setExpenses(nextExpenses);
      setActiveMemberIds(new Set(nextMembers.map((member) => member.user_id)));
      setProfiles(await getProfiles([...profileIds]));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load expenses');
    } finally {
      setLoading(false);
    }
  }, [ledgerLoading]);

  useEffect(() => {
    setExpenses([]);
    setProfiles({});
    setActiveMemberIds(new Set());
    resetFilters();
    setCollapsedSections(new Set());
    collapseDefaultsMonthRef.current = null;
    setDetailSelection(null);
    setSplitSelection(null);
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
    const colorsById = new Map<string, string>();
    if (!currentUserId) {
      for (const userId of sortedUserIds) {
        colorsById.set(userId, colors.subtle);
      }

      return colorsById;
    }

    const fallbackColors = [
      '#F97316',
      ...CHART_PALETTE.filter((color) => (
        color !== colors.primary &&
        color !== colors.primaryDark &&
        color !== '#F97316'
      ))
    ];
    let fallbackColorIndex = 0;

    for (const userId of sortedUserIds) {
      if (userId === currentUserId) {
        colorsById.set(userId, colors.primaryDark);
      } else {
        colorsById.set(userId, fallbackColors[fallbackColorIndex % fallbackColors.length]);
        fallbackColorIndex += 1;
      }
    }

    return colorsById;
  }, [currentUserId, sortedUserIds]);

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
    const monthKeys = new Set<string>([currentMonthKey()]);
    for (const expense of expenses) {
      monthKeys.add(monthKeyFromDateString(expense.spent_on));
    }

    return [...monthKeys]
      .sort(compareMonthKeys)
      .reverse()
      .map((monthKey) => ({
        label: formatMonthLabel(monthKey),
        value: monthKey
      }));
  }, [expenses]);

  const filteredExpenses = useMemo<FilteredExpense[]>(() => {
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
      if (expenseMonth !== selectedMonth) {
        continue;
      }

      nextFilteredExpenses.push({ displayAmountYen, expense });
    }

    return nextFilteredExpenses.sort((a, b) => (
      b.expense.spent_on.localeCompare(a.expense.spent_on) ||
      b.expense.created_at.localeCompare(a.expense.created_at)
    ));
  }, [expenses, selectedCategories, selectedMonth, selectedUserId]);

  const hasActiveFilters = Boolean(
    selectedUserId ||
    selectedCategories.size > 0
  );

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

  useEffect(() => {
    if (collapseDefaultsMonthRef.current === selectedMonth) {
      return;
    }

    const today = todayDateString();
    const monthDates = expenses
      .filter((expense) => monthKeyFromDateString(expense.spent_on) === selectedMonth)
      .map((expense) => expense.spent_on);

    if (monthDates.length === 0) {
      collapseDefaultsMonthRef.current = selectedMonth;
      return;
    }

    const defaultCollapsedDates = new Set(
      monthDates.filter((date) => date !== today)
    );

    setCollapsedSections(defaultCollapsedDates);
    collapseDefaultsMonthRef.current = selectedMonth;
  }, [expenses, selectedMonth]);

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
      accent: userColorById.get(userId) || colors.primary,
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
        <View style={localStyles.brandBlock}>
          <View style={localStyles.brandRow}>
            <Ionicons color={colors.primaryDark} name="calendar" size={24} />
            <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.brandTitle}>
              {formatMonthLabel(selectedMonth)}
            </Text>
          </View>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <BentoCard style={localStyles.summaryCard}>
        <View style={localStyles.summaryTotalBlock}>
          <View style={localStyles.summaryLabelRow}>
            <Text style={localStyles.summaryLabel}>Filtered Total</Text>
            <Ionicons color={colors.muted} name="information-circle-outline" size={17} />
          </View>
          <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.summaryAmount}>
            {formatYen(total)}
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
          <FilterControlButton
            active
            icon="calendar-outline"
            label={formatMonthLabel(selectedMonth)}
            onPress={() => openDropdown('month')}
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
            {activeDropdown === 'month' ? (
              <OptionList
                onChange={selectMonth}
                options={monthOptions}
                selectedValue={selectedMonth}
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
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
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
          category: item.expense.category,
          dateLabel: formatHistoryDate(item.expense.spent_on),
          leadingIcon: iconNameForExpenseCategory(item.expense.category),
          leadingIconColor: colorForCategory(item.expense.category),
          subtitle: rowSubtitle(item.expense),
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

function colorForCategory(category: string) {
  return CHART_PALETTE[hashString(category) % CHART_PALETTE.length] || colors.primaryDark;
}

function uniqueUserIds(userIds: string[]) {
  return [...new Set(userIds.filter(Boolean))];
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash);
}

const localStyles = StyleSheet.create({
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
  pressed: {
    opacity: 0.76
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
  detailDivider: {
    backgroundColor: 'rgba(100,116,139,0.15)',
    height: 1,
    marginLeft: 82
  },
  sectionDetailSegment: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(100,116,139,0.08)',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    overflow: 'hidden'
  },
  sectionDetailSegmentFirst: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    marginTop: -1,
    ...theme.shadow,
    shadowOpacity: 0.025,
    shadowRadius: 10
  },
  sectionDetailSegmentLast: {
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomWidth: 1,
    marginBottom: 14
  },
  sectionHeader: {
    alignItems: 'center',
    backgroundColor: colors.glass,
    borderColor: 'rgba(15,118,110,0.14)',
    borderRadius: theme.radii.surface,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 8,
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 13,
    ...theme.shadow,
    shadowOpacity: 0.09,
    shadowRadius: 18
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
  summaryTotalBlock: {
    gap: 8,
    minWidth: 0
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between'
  }
});
