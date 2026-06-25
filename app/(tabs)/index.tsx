import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryDetailSheet } from '@/src/components/CategoryDetailSheet';
import { DashboardCategoryShare } from '@/src/components/DashboardCategoryShare';
import { DashboardDailyActivity } from '@/src/components/DashboardDailyActivity';
import { DashboardDailyTrend } from '@/src/components/DashboardDailyTrend';
import { SlidingValueText } from '@/src/components/SlidingValueText';
import { colors, fontFamilies, styles } from '@/src/components/styles';
import { TransferChecklistCard } from '@/src/components/TransferChecklistCard';
import { BentoCard } from '@/src/components/ui';
import { useDashboardData } from '@/src/hooks/useDashboardData';
import { useTransferChecklist } from '@/src/hooks/useTransferChecklist';
import { buildUserColorMap, colorForDarkSurface, DEFAULT_PARTNER_COLOR, DEFAULT_USER_COLOR } from '@/src/lib/entityColors';
import { DEFAULT_LEDGER_TIME_ZONE, displayName, formatYen, todayDateString } from '@/src/lib/format';
import { getSpendComparisonPresentation } from '@/src/lib/spendComparison';
import { isIntentionalMonthSwipe } from '@/src/lib/swipe';
import {
  buildDashboardHeatDays,
  currentMonthKey,
  monthKeyFromDateString,
  resolveDashboardPeriodNavigation,
  type CategoryStat,
  type DashboardPeriod
} from '@/src/lib/stats';

const PERIOD_OPTIONS: { label: string; value: DashboardPeriod }[] = [
  { label: 'D', value: 'today' },
  { label: 'W', value: 'week' },
  { label: 'M', value: 'month' }
];

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const currentDashboardMonthKey = currentMonthKey();
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const {
    ledger,
    members,
    currentUserId,
    otherUserId,
    minimumMonthKey,
    settledExpenses,
    stats,
    error,
    reload
  } = useDashboardData(currentDashboardMonthKey, period, periodOffset);
  const {
    items: transferItems,
    loading: transferLoading,
    saving: transferSaving,
    error: transferError,
    reload: reloadTransfers,
    setConfirmations
  } = useTransferChecklist(ledger?.id || null);

  const currentUserName = displayName(members.find((member) => member.user_id === currentUserId)?.profile.display_name);
  const otherUserName = displayName(members.find((member) => member.user_id === otherUserId)?.profile.display_name);
  const memberStats = stats.memberTotals;
  const currentMemberStat = memberStats.find((member) => member.userId === currentUserId);
  const otherMemberStat = memberStats.find((member) => member.userId === otherUserId);
  const userIds = useMemo(() => (
    members.map((member) => member.user_id)
  ), [members]);
  const userColorById = useMemo(() => (
    buildUserColorMap(userIds, currentUserId)
  ), [currentUserId, userIds]);
  const currentUserColor = currentUserId ? userColorById.get(currentUserId) || DEFAULT_USER_COLOR : DEFAULT_USER_COLOR;
  const otherUserColor = otherUserId ? userColorById.get(otherUserId) || DEFAULT_PARTNER_COLOR : DEFAULT_PARTNER_COLOR;
  const currentUserColorOnDark = colorForDarkSurface(currentUserColor);
  const otherUserColorOnDark = colorForDarkSurface(otherUserColor);
  const heatmapMonthKey = stats.dateRange.effectiveMonthKey;
  const ledgerTodayString = todayDateString(DEFAULT_LEDGER_TIME_ZONE);
  const periodNavigation = resolveDashboardPeriodNavigation({
    minimumMonthKey,
    monthKey: currentDashboardMonthKey,
    offset: periodOffset,
    period,
    today: ledgerTodayString
  });
  const heatDays = useMemo(() => (
    buildDashboardHeatDays({
      expenses: settledExpenses,
      monthKey: heatmapMonthKey,
      members,
      currentUserId,
      today: ledgerTodayString
    })
  ), [currentUserId, heatmapMonthKey, ledgerTodayString, members, settledExpenses]);
  const selectedCategoryDetail = useMemo(() => (
    selectedCategoryKey
      ? stats.getCategoryDetail(selectedCategoryKey)
      : null
  ), [selectedCategoryKey, stats]);
  const dashboardComparison = getSpendComparisonPresentation(stats.comparison.direction, {
    neutralIcon: 'remove',
    tone: 'onDark'
  });
  const averageDenominator = dashboardAverageDenominator({
    effectiveMonthKey: stats.dateRange.effectiveMonthKey,
    endDateString: stats.dateRange.endDateString,
    period,
    startDateString: stats.dateRange.startDateString,
    todayString: ledgerTodayString
  });
  const averagePerDay = stats.totalYen / Math.max(1, averageDenominator);

  const closeCategoryDetail = useCallback(() => {
    setSelectedCategoryKey(null);
  }, []);

  useEffect(() => {
    if (selectedCategoryKey && !selectedCategoryDetail) {
      setSelectedCategoryKey(null);
    }
  }, [selectedCategoryDetail, selectedCategoryKey]);

  useFocusEffect(useCallback(() => (
    () => setSelectedCategoryKey(null)
  ), []));

  const movePeriod = useCallback((amount: number) => {
    setSelectedCategoryKey(null);
    setPeriodOffset((current) => current + amount);
  }, []);

  const refreshDashboard = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await Promise.all([reload({ userInitiated: true }), reloadTransfers({ userInitiated: true })]);
    } finally {
      setManualRefreshing(false);
    }
  }, [reload, reloadTransfers]);

  function selectPeriod(nextPeriod: DashboardPeriod) {
    if (nextPeriod === period) {
      return;
    }

    setSelectedCategoryKey(null);
    setPeriod(nextPeriod);
    setPeriodOffset(0);
  }

  function openCategoryDetail(category: CategoryStat) {
    setSelectedCategoryKey(category.detailKey);
  }

  function viewHistoryDate(date: string) {
    const targetMonthKey = monthKeyFromDateString(date);
    router.push({
      pathname: '/(tabs)/history',
      params: {
        month: targetMonthKey,
        date
      }
    });
  }

  const monthSwipeResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return isIntentionalMonthSwipe(
        gestureState.dx,
        gestureState.dy,
        gestureState.vx,
        gestureState.vy
      );
    },
    onPanResponderRelease: (_, gestureState) => {
      if (!isIntentionalMonthSwipe(gestureState.dx, gestureState.dy, gestureState.vx, gestureState.vy)) {
        return;
      }

      if (gestureState.dx > 0 && periodNavigation.canGoPrevious) {
        movePeriod(-1);
      }

      if (gestureState.dx < 0 && periodNavigation.canGoNext) {
        movePeriod(1);
      }
    },
    onPanResponderTerminationRequest: () => true
  }), [movePeriod, periodNavigation.canGoNext, periodNavigation.canGoPrevious]);

  return (
    <>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          <RefreshControl
            refreshing={manualRefreshing}
            onRefresh={refreshDashboard}
          />
        }
        style={styles.page}
        contentContainerStyle={[styles.content, localStyles.content, { paddingTop: Math.max(0, insets.top) }]}
      >
        <View style={localStyles.dashboardContent}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View
            style={localStyles.heroZone}
            {...monthSwipeResponder.panHandlers}
          >
            <BentoCard variant="hero" style={localStyles.heroCard}>
              <View style={localStyles.heroTop}>
                <View style={localStyles.heroSwitch}>
                  <HeroChevron
                    accessibilityLabel={`Previous ${period}`}
                    disabled={!periodNavigation.canGoPrevious}
                    direction="back"
                    onPress={() => movePeriod(-1)}
                  />
                  <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.heroMonth}>
                    {periodNavigation.label}
                  </Text>
                  <HeroChevron
                    accessibilityLabel={`Next ${period}`}
                    disabled={!periodNavigation.canGoNext}
                    direction="forward"
                    onPress={() => movePeriod(1)}
                  />
                </View>

                <View style={localStyles.periodSegment}>
                  {PERIOD_OPTIONS.map((option) => {
                    const active = option.value === period;
                    return (
                      <Pressable
                        accessibilityLabel={`Show ${periodLabel(option.value)} dashboard`}
                        accessibilityRole="button"
                        key={option.value}
                        onPress={() => selectPeriod(option.value)}
                        style={({ pressed }) => [
                          localStyles.periodOption,
                          active && localStyles.periodOptionActive,
                          pressed && !active && localStyles.periodOptionPressed
                        ]}
                      >
                        <Text style={[localStyles.periodText, active && localStyles.periodTextActive]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={localStyles.heroAmountRow}>
                <View style={localStyles.heroAmountBlock}>
                  <Text style={localStyles.heroLabel}>TOTAL SPEND</Text>
                  <SlidingValueText
                    formatValue={formatYen}
                    textStyle={localStyles.heroAmount}
                    value={stats.totalYen}
                    wrapperStyle={localStyles.heroAmountSlot}
                  />
                </View>
                <View style={localStyles.heroMeta}>
                  <Text style={localStyles.heroMetaText}>{stats.count} records</Text>
                  <Text style={localStyles.heroMetaText}>{formatYen(Math.round(averagePerDay))} / day</Text>
                </View>
              </View>

              <View style={localStyles.comparisonRow}>
                <Ionicons
                  color={dashboardComparison.color}
                  name={dashboardComparison.icon || 'remove'}
                  size={14}
                />
                <SlidingValueText
                  formatValue={formatComparisonAmount}
                  textStyle={[localStyles.comparisonAmountText, { color: dashboardComparison.color }]}
                  value={Math.abs(stats.comparison.deltaYen)}
                  wrapperStyle={localStyles.comparisonAmountSlot}
                />
                <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.comparisonText}>
                  {stats.comparison.label}
                </Text>
                <View style={localStyles.percentBadge}>
                  <Text style={[localStyles.percentBadgeText, { color: dashboardComparison.color }]}>
                    {formatComparisonPercentage(stats.comparison.percentage)}
                  </Text>
                </View>
              </View>

              <View style={localStyles.heroDivider} />

              <View style={localStyles.memberSplitRow}>
                <MemberSplit
                  amountYen={currentMemberStat?.amountYen || 0}
                  color={currentUserColorOnDark}
                  label={currentUserName}
                />
                {otherUserId ? (
                  <>
                    <View style={localStyles.memberDivider} />
                    <MemberSplit
                      amountYen={otherMemberStat?.amountYen || 0}
                      color={otherUserColorOnDark}
                      label={otherUserName}
                    />
                  </>
                ) : null}
              </View>
            </BentoCard>
          </View>

          <DashboardDailyActivity
            days={heatDays}
            monthKey={heatmapMonthKey}
            onViewHistoryDate={viewHistoryDate}
            todayString={ledgerTodayString}
          />

          <DashboardCategoryShare
            categories={stats.categories}
            onCategoryPress={openCategoryDetail}
            selectedCategoryKey={selectedCategoryKey}
            totalYen={stats.totalYen}
          />

          <DashboardDailyTrend
            currentUserColor={currentUserColor}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            otherUserColor={otherUserColor}
            otherUserId={otherUserId}
            otherUserName={otherUserName}
            series={stats.dailyUserSeries}
            todayString={ledgerTodayString}
          />

          <TransferChecklistCard
            currentUserId={currentUserId}
            error={transferError}
            items={transferItems}
            loading={transferLoading}
            members={members}
            onSetConfirmations={setConfirmations}
            saving={transferSaving}
          />
        </View>
      </ScrollView>

      <CategoryDetailSheet
        detail={selectedCategoryDetail}
        members={members}
        onClose={closeCategoryDetail}
      />
    </>
  );
}

function HeroChevron({
  accessibilityLabel,
  direction,
  disabled,
  onPress
}: {
  accessibilityLabel: string;
  direction: 'back' | 'forward';
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        localStyles.heroChevron,
        disabled && localStyles.heroChevronDisabled,
        pressed && !disabled && localStyles.heroChevronPressed
      ]}
    >
      <Ionicons
        color={disabled ? 'rgba(255,253,247,0.24)' : 'rgba(255,253,247,0.72)'}
        name={direction === 'back' ? 'chevron-back' : 'chevron-forward'}
        size={16}
      />
    </Pressable>
  );
}

function MemberSplit({
  amountYen,
  color,
  label
}: {
  amountYen: number;
  color: string;
  label: string;
}) {
  return (
    <View style={localStyles.memberSplit}>
      <View style={localStyles.memberName}>
        <View style={[localStyles.memberDot, { backgroundColor: color }]} />
        <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.memberNameText}>
          {displayName(label).toUpperCase()}
        </Text>
      </View>
      <SlidingValueText
        formatValue={formatYen}
        textStyle={localStyles.memberAmount}
        value={amountYen}
        wrapperStyle={localStyles.memberAmountSlot}
      />
    </View>
  );
}

function dashboardAverageDenominator(input: {
  effectiveMonthKey: string;
  endDateString: string;
  period: DashboardPeriod;
  startDateString: string;
  todayString: string;
}) {
  if (input.period === 'today') {
    return 1;
  }

  if (input.period === 'week') {
    return daysBetween(input.startDateString, input.endDateString) + 1;
  }

  const daysInSelectedMonth = daysInMonth(input.effectiveMonthKey);
  if (input.effectiveMonthKey === input.todayString.slice(0, 7)) {
    return Math.min(Number(input.todayString.slice(8, 10)), daysInSelectedMonth);
  }

  return daysInSelectedMonth;
}

function daysInMonth(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

function daysBetween(startDateString: string, endDateString: string) {
  const start = parseDateString(startDateString).getTime();
  const end = parseDateString(endDateString).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function parseDateString(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function periodLabel(period: DashboardPeriod) {
  if (period === 'today') {
    return 'today';
  }

  if (period === 'week') {
    return 'week';
  }

  return 'month';
}

function formatComparisonAmount(amountYen: number) {
  if (amountYen <= 100) {
    return formatYen(amountYen);
  }

  const value = amountYen / 1000;
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `¥${rounded}k`;
}

function formatComparisonPercentage(percentage: number | null) {
  if (percentage === null) {
    return '--';
  }

  if (percentage === 0) {
    return '0.0%';
  }

  const sign = percentage > 0 ? '+' : '-';
  return `${sign}${Math.abs(percentage).toFixed(1)}%`;
}

const localStyles = StyleSheet.create({
  comparisonAmountSlot: {
    flexShrink: 0,
    height: 18
  },
  comparisonAmountText: {
    flexShrink: 0,
    fontFamily: fontFamilies.monoBold,
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 18
  },
  comparisonRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 9,
    minHeight: 24
  },
  comparisonText: {
    color: 'rgba(255,253,247,0.66)',
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    minWidth: 0
  },
  content: {
    gap: 0
  },
  dashboardContent: {
    gap: 13
  },
  heroAmount: {
    color: '#FFFDF7',
    fontFamily: fontFamilies.monoBold,
    fontSize: 37,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 40
  },
  heroAmountBlock: {
    flex: 1,
    minWidth: 0
  },
  heroAmountRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  heroAmountSlot: {
    height: 40,
    marginTop: 4
  },
  heroCard: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderRadius: 22,
    boxShadow: '0 20px 40px -20px rgba(42,39,34,0.55)',
    gap: 0,
    minHeight: 0,
    overflow: 'hidden',
    paddingBottom: 15,
    paddingHorizontal: 16,
    paddingTop: 13
  },
  heroChevron: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,253,247,0.08)',
    borderRadius: 8,
    height: 26,
    justifyContent: 'center',
    width: 26
  },
  heroChevronDisabled: {
    opacity: 0.52
  },
  heroChevronPressed: {
    backgroundColor: 'rgba(255,253,247,0.14)'
  },
  heroDivider: {
    backgroundColor: 'rgba(255,253,247,0.12)',
    height: 1,
    marginBottom: 11,
    marginTop: 12
  },
  heroLabel: {
    color: 'rgba(255,253,247,0.50)',
    fontFamily: fontFamilies.monoBold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
    lineHeight: 12
  },
  heroMeta: {
    alignItems: 'flex-end',
    gap: 3,
    paddingBottom: 2
  },
  heroMetaText: {
    color: 'rgba(255,253,247,0.50)',
    fontFamily: fontFamilies.mono,
    fontSize: 9.5,
    lineHeight: 13
  },
  heroMonth: {
    color: '#FFFDF7',
    flexShrink: 1,
    fontFamily: fontFamilies.extraBold,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
    maxWidth: 142,
    minWidth: 0,
    textAlign: 'center'
  },
  heroSwitch: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0
  },
  heroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 13
  },
  heroZone: {
    transformOrigin: 'top center'
  },
  memberAmount: {
    color: '#FFFDF7',
    fontFamily: fontFamilies.monoBold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'right'
  },
  memberAmountSlot: {
    flexShrink: 0,
    height: 20
  },
  memberDivider: {
    backgroundColor: 'rgba(255,253,247,0.12)',
    height: 22,
    width: 1
  },
  memberDot: {
    borderRadius: 2,
    height: 7,
    width: 7
  },
  memberName: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minWidth: 0
  },
  memberNameText: {
    color: 'rgba(255,253,247,0.60)',
    flex: 1,
    fontFamily: fontFamilies.monoBold,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    lineHeight: 13,
    minWidth: 0
  },
  memberSplit: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minWidth: 0
  },
  memberSplitRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14
  },
  percentBadge: {
    backgroundColor: 'rgba(232,149,123,0.16)',
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3
  },
  percentBadgeText: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15
  },
  periodOption: {
    alignItems: 'center',
    borderRadius: 6,
    height: 24,
    justifyContent: 'center',
    minWidth: 27,
    paddingHorizontal: 8
  },
  periodOptionActive: {
    backgroundColor: 'rgba(255,253,247,0.92)'
  },
  periodOptionPressed: {
    backgroundColor: 'rgba(255,253,247,0.12)'
  },
  periodSegment: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,253,247,0.08)',
    borderRadius: 9,
    flexDirection: 'row',
    gap: 2,
    padding: 3
  },
  periodText: {
    color: 'rgba(255,253,247,0.50)',
    fontFamily: fontFamilies.monoBold,
    fontSize: 10.5,
    fontWeight: '700',
    lineHeight: 14
  },
  periodTextActive: {
    color: colors.primary
  }
});
