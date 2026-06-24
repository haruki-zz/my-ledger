import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PanResponder, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryDetailSheet } from '@/src/components/CategoryDetailSheet';
import { DailyChart } from '@/src/components/DailyChart';
import { DailyActivityHeatmap } from '@/src/components/DailyActivityHeatmap';
import { PieChart } from '@/src/components/PieChart';
import { SlidingValueText } from '@/src/components/SlidingValueText';
import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { TransferChecklistCard } from '@/src/components/TransferChecklistCard';
import { BentoCard, IconButton, PillTabs, type PillTabOption } from '@/src/components/ui';
import { useDashboardData } from '@/src/hooks/useDashboardData';
import { useTransferChecklist } from '@/src/hooks/useTransferChecklist';
import { tintFromAccent } from '@/src/lib/color';
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

const PERIOD_OPTIONS: PillTabOption<DashboardPeriod>[] = [
  { label: 'Today', value: 'today' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' }
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
    if (targetMonthKey !== currentMonthKey()) {
      router.push({
        pathname: '/(tabs)/receipts',
        params: { month: targetMonthKey }
      });
      return;
    }

    router.push({
      pathname: '/(tabs)/history',
      params: {
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
        refreshControl={
          <RefreshControl
            refreshing={manualRefreshing}
            onRefresh={refreshDashboard}
          />
        }
        style={styles.page}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
      >
        <View style={localStyles.dashboardContent}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={localStyles.monthSwipeArea} {...monthSwipeResponder.panHandlers}>
            <View style={localStyles.monthAnchor}>
              <IconButton
                accessibilityLabel={`Previous ${period}`}
                disabled={!periodNavigation.canGoPrevious}
                icon="chevron-back"
                onPress={() => movePeriod(-1)}
                size="sm"
                tone="primary"
              />

              <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.monthLabel}>
                {periodNavigation.label}
              </Text>

              <IconButton
                accessibilityLabel={`Next ${period}`}
                disabled={!periodNavigation.canGoNext}
                icon="chevron-forward"
                onPress={() => movePeriod(1)}
                size="sm"
                tone="primary"
              />
            </View>

            <PillTabs
              accessibilityLabel="Dashboard period"
              onChange={selectPeriod}
              options={PERIOD_OPTIONS}
              size="sm"
              style={localStyles.periodPillTrack}
              value={period}
            />

            <BentoCard variant="hero" style={localStyles.heroCard}>
              <View style={localStyles.heroContent}>
                <SlidingValueText
                  formatValue={formatYen}
                  textStyle={localStyles.heroAmount}
                  value={stats.totalYen}
                  wrapperStyle={localStyles.heroAmountSlot}
                />

                <View style={localStyles.comparisonRow}>
                  <Ionicons
                    color={dashboardComparison.color}
                    name={dashboardComparison.icon || 'remove'}
                    size={18}
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
              </View>
            </BentoCard>
          </View>

          <TransferChecklistCard
            currentUserId={currentUserId}
            error={transferError}
            items={transferItems}
            loading={transferLoading}
            members={members}
            onSetConfirmations={setConfirmations}
            saving={transferSaving}
          />

          <DailyActivityHeatmap
            days={heatDays}
            monthKey={heatmapMonthKey}
            onViewHistoryDate={viewHistoryDate}
            todayString={ledgerTodayString}
          />

          <BentoCard style={localStyles.categoryCard}>
            <View style={localStyles.sectionHeader}>
              <Text style={[styles.upperLabel, localStyles.greenLabel]}>Category Share</Text>
              {stats.totalYen > 0 ? (
                <View style={localStyles.categoryHint}>
                  <Ionicons color={colors.secondary} name="hand-left-outline" size={13} />
                  <Text style={localStyles.categoryHintText}>Tap to break down</Text>
                </View>
              ) : null}
            </View>
            <PieChart
              categories={stats.categories}
              onCategoryPress={openCategoryDetail}
              selectedCategoryKey={selectedCategoryKey}
              totalYen={stats.totalYen}
            />
          </BentoCard>

          <BentoCard variant="chart" style={localStyles.trendCard}>
            <View style={localStyles.dailyTrendHeader}>
              <View style={localStyles.dailyTrendTitle}>
                <View style={localStyles.trendTitleRow}>
                  <Ionicons color={colors.primaryDark} name="trending-up-outline" size={24} />
                  <Text style={[styles.upperLabel, localStyles.greenLabel]}>Daily Trend</Text>
                </View>
              </View>

              <View style={localStyles.trendActions}>
                <View style={localStyles.dailyTrendLegend}>
                  {currentUserId ? <UserLegendPill color={currentUserColor} label={currentUserName} /> : null}
                  {otherUserId ? <UserLegendPill color={otherUserColor} label={otherUserName} /> : null}
                </View>
              </View>
            </View>

            <DailyChart
              currentUserColor={currentUserColor}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              otherUserColor={otherUserColor}
              otherUserId={otherUserId}
              otherUserName={otherUserName}
              series={stats.dailyUserSeries}
            />
          </BentoCard>
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

function UserLegendPill({ color, label }: { color: string; label: string }) {
  return (
    <View style={[
      localStyles.userLegendPill,
      { backgroundColor: tintFromAccent(color) }
    ]}>
      <View style={[localStyles.userLegendDot, { backgroundColor: color }]} />
      <Text ellipsizeMode="tail" numberOfLines={1} style={[localStyles.userLegendText, { color }]}>
        {label}
      </Text>
    </View>
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
      <View style={localStyles.memberNamePill}>
        <Text ellipsizeMode="tail" numberOfLines={1} style={[localStyles.memberNamePillText, { color }]}>
          {label}
        </Text>
      </View>
      <SlidingValueText
        formatValue={formatYen}
        textStyle={[localStyles.memberAmount, { color }]}
        value={amountYen}
        wrapperStyle={localStyles.memberAmountSlot}
      />
    </View>
  );
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
  categoryCard: {
    gap: 16
  },
  categoryHint: {
    alignItems: 'center',
    backgroundColor: 'rgba(192,137,46,0.08)',
    borderColor: colors.line,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 24,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  categoryHintText: {
    color: colors.secondary,
    fontFamily: fontFamilies.bold,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15
  },
  comparisonRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minHeight: 32
  },
  comparisonText: {
    color: 'rgba(255,255,255,0.72)',
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    minWidth: 0
  },
  comparisonAmountText: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    flexShrink: 0
  },
  comparisonAmountSlot: {
    flexShrink: 0,
    height: 20
  },
  dashboardContent: {
    gap: 18
  },
  dailyTrendHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  dailyTrendTitle: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  greenLabel: {
    color: colors.primaryDark,
    fontSize: 13
  },
  heroAmount: {
    color: '#FFFDF7',
    fontFamily: fontFamilies.monoBold,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 48
  },
  heroAmountSlot: {
    height: 48
  },
  heroCard: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    gap: 0,
    minHeight: 0,
    padding: 0,
    overflow: 'hidden'
  },
  heroContent: {
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 16,
    paddingTop: 15
  },
  heroDivider: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    height: 1,
    marginTop: 2
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between'
  },
  memberAmount: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'left'
  },
  memberAmountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 32,
    justifyContent: 'space-between'
  },
  memberAmountSlot: {
    flexShrink: 0,
    height: 22
  },
  memberDivider: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    width: 1
  },
  memberNamePill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: theme.radii.pill,
    flexShrink: 1,
    maxWidth: 78,
    minHeight: 22,
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3
  },
  memberNamePillText: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 14,
    minWidth: 0
  },
  memberSplit: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minWidth: 0
  },
  memberSplitRow: {
    flexDirection: 'row',
    gap: 10,
    minHeight: 22
  },
  monthAnchor: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 54
  },
  monthLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 38,
    textAlign: 'center'
  },
  monthlyTotalLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
    lineHeight: 20,
    textTransform: 'uppercase'
  },
  monthSwipeArea: {
    gap: 10
  },
  percentBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  percentBadgeText: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18
  },
  periodPillTrack: {
    alignSelf: 'stretch'
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  trendActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  dailyTrendLegend: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
    justifyContent: 'flex-end',
    minWidth: 0
  },
  trendCard: {
    minHeight: 0
  },
  trendTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  userLegendDot: {
    borderRadius: 4,
    height: 8,
    width: 8
  },
  userLegendPill: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 6,
    maxWidth: 112,
    minHeight: 24,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  userLegendText: {
    flexShrink: 1,
    fontFamily: fontFamilies.monoBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 14
  }
});
