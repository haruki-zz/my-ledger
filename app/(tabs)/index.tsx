import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryTrendModal } from '@/src/components/CategoryTrendModal';
import { DailyChart, type DailyChartMode } from '@/src/components/DailyChart';
import { PieChart, type AnchorPoint } from '@/src/components/PieChart';
import { colors, fontFamilies, styles } from '@/src/components/styles';
import { TransferChecklistCard } from '@/src/components/TransferChecklistCard';
import { BentoCard, IconButton, PillTabs, type PillTabOption } from '@/src/components/ui';
import { useDashboardData } from '@/src/hooks/useDashboardData';
import { useTransferChecklist } from '@/src/hooks/useTransferChecklist';
import { displayName, formatYen } from '@/src/lib/format';
import {
  addMonths,
  compareMonthKeys,
  currentMonthKey,
  type CategoryStat,
  type DashboardRange
} from '@/src/lib/stats';

type RangeOption = {
  label: string;
  value: DashboardRange;
  disabled?: boolean;
};

type SelectedCategoryState = {
  category: CategoryStat;
  anchorPoint?: AnchorPoint;
};

const CHART_MODES: { label: string; value: DailyChartMode }[] = [
  { label: 'Curve', value: 'curve' },
  { label: 'Bar', value: 'bar' }
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
  const [range, setRange] = useState<DashboardRange>('all');
  const [chartMode, setChartMode] = useState<DailyChartMode>('bar');
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
    dataVersion,
    loading,
    refreshing,
    error,
    reload
  } = useDashboardData(monthKey, range);
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
  const rangeOptions: RangeOption[] = [
    { label: 'Both', value: 'all' },
    { label: currentUserName, value: 'current' },
    { disabled: !otherUserId, label: otherUserId ? otherUserName : 'Partner', value: 'other' }
  ];
  const chartModeOptions = CHART_MODES satisfies PillTabOption<DailyChartMode>[];
  const atCurrentMonth = compareMonthKeys(monthKey, currentMonthKey()) >= 0;
  const atMinimumMonth = minimumMonthKey ? compareMonthKeys(monthKey, minimumMonthKey) <= 0 : false;
  const isSwitchingMonth = refreshing && Boolean(loadedMonthKey && loadedMonthKey !== monthKey);
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

  useEffect(() => {
    if (range === 'other' && !otherUserId) {
      setRange('all');
    }
  }, [otherUserId, range]);

  const moveMonth = useCallback((amount: number) => {
    setMonthKey((current) => addMonths(current, amount));
  }, []);

  const refreshDashboard = useCallback(() => {
    void Promise.all([reload(), reloadTransfers()]);
  }, [reload, reloadTransfers]);

  const runDrillTransition = useCallback(() => {
    drillProgress.stopAnimation();
    drillProgress.setValue(0);
    Animated.timing(drillProgress, {
      duration: 240,
      toValue: 1,
      useNativeDriver: true
    }).start();
  }, [drillProgress]);

  function selectRange(nextRange: DashboardRange) {
    if (nextRange === range) {
      return;
    }

    runDrillTransition();
    setRange(nextRange);
  }

  function openCategoryTrend(category: CategoryStat, anchorPoint?: AnchorPoint) {
    setSelectedCategory({ category, anchorPoint });
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

      if (gestureState.dx > 0 && !atMinimumMonth) {
        moveMonth(-1);
      }

      if (gestureState.dx < 0 && !atCurrentMonth) {
        moveMonth(1);
      }
    },
    onPanResponderTerminationRequest: () => true
  }), [atCurrentMonth, atMinimumMonth, moveMonth]);

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
                disabled={atMinimumMonth}
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
                disabled={atCurrentMonth}
                icon="chevron-forward"
                onPress={() => moveMonth(1)}
                size="sm"
                tone="primary"
              />
            </View>

            <BentoCard variant="hero" style={localStyles.heroCard}>
              <Animated.View style={[localStyles.heroContent, drillAnimatedStyle]}>
                <Text style={styles.upperLabel}>Monthly Total</Text>
                <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.heroAmount}>
                  {formatYen(stats.totalYen)}
                </Text>
                <Text style={localStyles.recordCount}>
                  {stats.count > 0 ? `${stats.count} records` : 'No expenses this month'}
                </Text>

                <PillTabs
                  accessibilityLabel="Expense range"
                  onChange={selectRange}
                  options={rangeOptions}
                  style={localStyles.rangePillTrack}
                  value={range}
                />
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
            <Text style={styles.h2}>Category share</Text>
            <PieChart
              categories={stats.categories}
              layout="horizontal"
              onCategoryPress={openCategoryTrend}
              totalYen={stats.totalYen}
            />
          </BentoCard>

          <BentoCard variant="chart" style={localStyles.trendCard}>
            <View style={localStyles.dailyTrendHeader}>
              <View style={localStyles.dailyTrendTitle}>
                <Text style={styles.h2}>Daily trend</Text>
                {isSwitchingMonth ? <Text style={styles.muted}>Updating</Text> : null}
              </View>

              <PillTabs
                accessibilityLabel="Chart type"
                onChange={setChartMode}
                options={chartModeOptions}
                style={localStyles.chartPillTrack}
                value={chartMode}
              />
            </View>

            <DailyChart mode={chartMode} series={stats.dailySeries} />
          </BentoCard>
        </View>
      </ScrollView>

      <CategoryTrendModal
        anchorPoint={selectedCategory?.anchorPoint}
        category={selectedCategory?.category || null}
        currentUserId={currentUserId}
        dataVersion={dataVersion}
        endMonthKey={loadedMonthKey || monthKey}
        ledgerId={ledger?.id || null}
        onClose={() => setSelectedCategory(null)}
        otherUserId={otherUserId}
        range={range}
        visible={Boolean(selectedCategory)}
      />
    </>
  );
}

function formatEnglishMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return monthLabelFormatter.format(new Date(year, month - 1, 1));
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
    gap: 18
  },
  chartPillTrack: {
    flex: 1,
    maxWidth: 160,
    minWidth: 132
  },
  dailyTrendHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  dailyTrendTitle: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  dashboardContent: {
    gap: 18
  },
  heroAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 46
  },
  heroCard: {
    gap: 0,
    minHeight: 0,
    padding: 22
  },
  heroContent: {
    gap: 10
  },
  monthLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 38,
    textAlign: 'center'
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
  rangePillTrack: {
    marginTop: 10
  },
  recordCount: {
    color: colors.muted,
    fontFamily: fontFamilies.extraBold,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22
  },
  refreshRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  trendCard: {
    minHeight: 0
  }
});
