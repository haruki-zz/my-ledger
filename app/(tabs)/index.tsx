import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DailyChart } from '@/src/components/DailyChart';
import { PieChart } from '@/src/components/PieChart';
import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { TransferChecklistCard } from '@/src/components/TransferChecklistCard';
import { BentoCard, IconButton, PillTabs, type PillTabOption } from '@/src/components/ui';
import { useDashboardData } from '@/src/hooks/useDashboardData';
import { useTransferChecklist } from '@/src/hooks/useTransferChecklist';
import { tintFromAccent } from '@/src/lib/color';
import { buildUserColorMap } from '@/src/lib/entityColors';
import { displayName, formatYen } from '@/src/lib/format';
import {
  addMonths,
  compareMonthKeys,
  currentMonthKey,
  type CategoryStat,
  type DashboardPeriod
} from '@/src/lib/stats';

type SelectedCategoryState = {
  category: CategoryStat;
};

const PERIOD_OPTIONS: PillTabOption<DashboardPeriod>[] = [
  { label: 'Today', value: 'today' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' }
];

const SWIPE_DISTANCE = 36;
const SWIPE_DIRECTION_RATIO = 2.5;
const SWIPE_VELOCITY = 0.35;
const SWIPE_VELOCITY_RATIO = 1.5;
const monthLabelFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric'
});

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [selectedCategory, setSelectedCategory] = useState<SelectedCategoryState | null>(null);
  const [drillProgress] = useState(() => new Animated.Value(1));
  const {
    ledger,
    members,
    currentUserId,
    otherUserId,
    minimumMonthKey,
    loadedMonthKey,
    stats,
    loading,
    refreshing,
    error,
    reload
  } = useDashboardData(monthKey, period);
  const {
    items: transferItems,
    loading: transferLoading,
    refreshing: transferRefreshing,
    saving: transferSaving,
    error: transferError,
    reload: reloadTransfers,
    setConfirmations
  } = useTransferChecklist(ledger?.id || null);

  const currentUserName = displayName(members.find((member) => member.user_id === currentUserId)?.profile.display_name);
  const otherUserName = displayName(members.find((member) => member.user_id === otherUserId)?.profile.display_name);
  const atCurrentMonth = compareMonthKeys(monthKey, currentMonthKey()) >= 0;
  const atMinimumMonth = minimumMonthKey ? compareMonthKeys(monthKey, minimumMonthKey) <= 0 : false;
  const monthNavigationDisabled = period !== 'month';
  const isSwitchingMonth = refreshing && Boolean(loadedMonthKey && loadedMonthKey !== monthKey);
  const memberStats = stats.memberTotals;
  const currentMemberStat = memberStats.find((member) => member.userId === currentUserId);
  const otherMemberStat = memberStats.find((member) => member.userId === otherUserId);
  const userIds = useMemo(() => (
    members.map((member) => member.user_id)
  ), [members]);
  const userColorById = useMemo(() => (
    buildUserColorMap(userIds, currentUserId)
  ), [currentUserId, userIds]);
  const currentUserColor = currentUserId ? userColorById.get(currentUserId) || colors.primaryDark : colors.primaryDark;
  const otherUserColor = otherUserId ? userColorById.get(otherUserId) || colors.warm : colors.warm;
  const drillAnimatedStyle = {
    opacity: drillProgress,
    transform: [
      {
        translateY: drillProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0]
        })
      },
      {
        scale: drillProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.985, 1]
        })
      }
    ]
  };

  const runDrillTransition = useCallback(() => {
    drillProgress.stopAnimation();
    drillProgress.setValue(0);
    Animated.timing(drillProgress, {
      duration: 240,
      toValue: 1,
      useNativeDriver: true
    }).start();
  }, [drillProgress]);

  const moveMonth = useCallback((amount: number) => {
    if (period !== 'month') {
      return;
    }

    runDrillTransition();
    setSelectedCategory(null);
    setMonthKey((current) => addMonths(current, amount));
  }, [period, runDrillTransition]);

  const refreshDashboard = useCallback(() => {
    void Promise.all([reload(), reloadTransfers()]);
  }, [reload, reloadTransfers]);

  function selectPeriod(nextPeriod: DashboardPeriod) {
    if (nextPeriod === period) {
      return;
    }

    runDrillTransition();
    setSelectedCategory(null);
    setPeriod(nextPeriod);
    if (nextPeriod !== 'month') {
      setMonthKey(currentMonthKey());
    }
  }

  function toggleCategorySelection(category: CategoryStat) {
    setSelectedCategory((current) => (
      current?.category.category === category.category
        ? null
        : { category }
    ));
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

      if (monthNavigationDisabled) {
        return;
      }

      if (gestureState.dx > 0 && !atMinimumMonth) {
        moveMonth(-1);
      }

      if (gestureState.dx < 0 && !atCurrentMonth) {
        moveMonth(1);
      }
    },
    onPanResponderTerminationRequest: () => true
  }), [atCurrentMonth, atMinimumMonth, monthNavigationDisabled, moveMonth]);

  return (
    <>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={(loading && !ledger) || refreshing || transferRefreshing}
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
                accessibilityLabel="Previous month"
                disabled={monthNavigationDisabled || atMinimumMonth}
                icon="chevron-back"
                onPress={() => moveMonth(-1)}
                size="sm"
                tone="primary"
              />

              <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.monthLabel}>
                {formatEnglishMonthLabel(monthKey)}
              </Text>

              <IconButton
                accessibilityLabel="Next month"
                disabled={monthNavigationDisabled || atCurrentMonth}
                icon="chevron-forward"
                onPress={() => moveMonth(1)}
                size="sm"
                tone="primary"
              />
            </View>

            <BentoCard variant="hero" style={localStyles.heroCard}>
              <Animated.View style={[localStyles.heroContent, drillAnimatedStyle]}>
                <View style={localStyles.heroTopRow}>
                  <Text style={localStyles.monthlyTotalLabel}>Total</Text>
                  <PillTabs
                    accessibilityLabel="Dashboard period"
                    onChange={selectPeriod}
                    options={PERIOD_OPTIONS}
                    size="sm"
                    style={localStyles.periodPillTrack}
                    value={period}
                  />
                </View>

                <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.heroAmount}>
                  {formatYen(stats.totalYen)}
                </Text>

                <View style={localStyles.comparisonRow}>
                  <Text ellipsizeMode="tail" numberOfLines={1} style={[localStyles.comparisonAmountText, { color: comparisonColor(stats.comparison.direction) }]}>
                    {formatComparisonAmount(Math.abs(stats.comparison.deltaYen))}
                  </Text>
                  <Ionicons
                    color={comparisonColor(stats.comparison.direction)}
                    name={comparisonIcon(stats.comparison.direction)}
                    size={18}
                  />
                  <Text ellipsizeMode="tail" numberOfLines={1} style={[localStyles.comparisonText, { color: comparisonColor(stats.comparison.direction) }]}>
                    {stats.comparison.label}
                  </Text>
                  <View style={localStyles.percentBadge}>
                    <Text style={localStyles.percentBadgeText}>
                      {formatComparisonPercentage(stats.comparison.percentage)}
                    </Text>
                  </View>
                </View>

                <View style={localStyles.heroDivider} />

                <View style={localStyles.memberSplitRow}>
                  <MemberSplit
                    amountYen={currentMemberStat?.amountYen || 0}
                    color={currentUserColor}
                    label={currentUserName}
                  />
                  {otherUserId ? (
                    <>
                      <View style={localStyles.memberDivider} />
                      <MemberSplit
                        amountYen={otherMemberStat?.amountYen || 0}
                        color={otherUserColor}
                        label={otherUserName}
                      />
                    </>
                  ) : null}
                </View>

                {refreshing ? (
                  <View style={localStyles.refreshRow}>
                    <ActivityIndicator color={colors.primary} size="small" />
                    <Text style={styles.muted}>{isSwitchingMonth ? 'Updating...' : 'Syncing...'}</Text>
                  </View>
                ) : null}
              </Animated.View>
            </BentoCard>
          </View>

          <TransferChecklistCard
            currentUserId={currentUserId}
            error={transferError}
            items={transferItems}
            loading={transferLoading}
            members={members}
            onSetConfirmations={setConfirmations}
            refreshing={transferRefreshing}
            saving={transferSaving}
          />

          <BentoCard style={localStyles.categoryCard}>
            <View style={localStyles.sectionHeader}>
              <Text style={[styles.upperLabel, localStyles.greenLabel]}>Category Share</Text>
            </View>
            <PieChart
              categories={stats.categories}
              onCategoryPress={toggleCategorySelection}
              selectedCategoryName={selectedCategory?.category.category}
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
      <View style={[localStyles.memberNamePill, { backgroundColor: tintFromAccent(color) }]}>
        <Text ellipsizeMode="tail" numberOfLines={1} style={[localStyles.memberNamePillText, { color }]}>
          {label}
        </Text>
      </View>
      <View style={localStyles.memberAmountRow}>
        <Text adjustsFontSizeToFit numberOfLines={1} style={[localStyles.memberAmount, { color }]}>
          {formatYen(amountYen)}
        </Text>
      </View>
    </View>
  );
}

function formatEnglishMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return monthLabelFormatter.format(new Date(year, month - 1, 1));
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

function comparisonColor(direction: 'under' | 'over' | 'same') {
  if (direction === 'over') {
    return '#C2410C';
  }

  return colors.primaryDark;
}

function comparisonIcon(direction: 'under' | 'over' | 'same') {
  if (direction === 'over') {
    return 'arrow-up' as const;
  }

  if (direction === 'under') {
    return 'arrow-down' as const;
  }

  return 'remove' as const;
}

function isIntentionalMonthSwipe(dx: number, dy: number, vx: number, vy: number) {
  const horizontalDistance = Math.abs(dx);
  const verticalDistance = Math.abs(dy);
  const horizontalVelocity = Math.abs(vx);
  const verticalVelocity = Math.abs(vy);

  if (horizontalDistance <= SWIPE_DISTANCE) {
    return false;
  }

  return (
    horizontalDistance > verticalDistance * SWIPE_DIRECTION_RATIO ||
    (horizontalVelocity > SWIPE_VELOCITY && horizontalVelocity > verticalVelocity * SWIPE_VELOCITY_RATIO)
  );
}

const localStyles = StyleSheet.create({
  categoryCard: {
    gap: 16
  },
  comparisonRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minHeight: 32
  },
  comparisonText: {
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    minWidth: 0
  },
  comparisonAmountText: {
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    flexShrink: 0
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
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 52,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 62
  },
  heroCard: {
    gap: 0,
    minHeight: 0,
    padding: 0,
    overflow: 'hidden'
  },
  heroContent: {
    gap: 12,
    padding: 22,
    paddingBottom: 0
  },
  heroDivider: {
    backgroundColor: colors.line,
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
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
    minWidth: 0,
    textAlign: 'left'
  },
  memberAmountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 32,
    justifyContent: 'space-between'
  },
  memberDivider: {
    backgroundColor: colors.line,
    width: 1
  },
  memberNamePill: {
    alignSelf: 'flex-start',
    borderRadius: theme.radii.pill,
    maxWidth: '100%',
    minHeight: 22,
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3
  },
  memberNamePillText: {
    fontFamily: fontFamilies.bold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    lineHeight: 14
  },
  memberSplit: {
    flex: 1,
    gap: 8,
    minWidth: 0
  },
  memberSplitRow: {
    flexDirection: 'row',
    gap: 18,
    minHeight: 72
  },
  monthAnchor: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 54
  },
  monthLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
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
    letterSpacing: 1.1,
    lineHeight: 20,
    textTransform: 'uppercase'
  },
  monthSwipeArea: {
    gap: 18
  },
  percentBadge: {
    backgroundColor: colors.tint,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  percentBadgeText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.bold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18
  },
  periodPillTrack: {
    flex: 1,
    maxWidth: 236,
    minWidth: 168
  },
  refreshRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 14
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
    fontFamily: fontFamilies.bold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 14
  }
});
