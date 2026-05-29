import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CategoryTrendModal } from '@/src/components/CategoryTrendModal';
import { DailyChart, type DailyChartMode } from '@/src/components/DailyChart';
import { PieChart, type AnchorPoint } from '@/src/components/PieChart';
import { colors, fontFamilies, styles } from '@/src/components/styles';
import { BentoCard, IconButton, MetricTile, PillTabs, type PillTabOption } from '@/src/components/ui';
import { useDashboardData } from '@/src/hooks/useDashboardData';
import { displayName, formatYen } from '@/src/lib/format';
import {
  addMonths,
  compareMonthKeys,
  currentMonthKey,
  formatMonthLabel,
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

export default function DashboardScreen() {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [range, setRange] = useState<DashboardRange>('all');
  const [chartMode, setChartMode] = useState<DailyChartMode>('curve');
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
        refreshControl={<RefreshControl refreshing={(loading && !ledger) || refreshing} onRefresh={reload} />}
        style={styles.page}
        contentContainerStyle={styles.content}
      >
        <View style={localStyles.pageHeader}>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.muted}>{ledger ? ledger.name : 'Shared Ledger'}</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <BentoCard variant="hero" style={localStyles.summarySection} {...monthSwipeResponder.panHandlers}>
          <View style={localStyles.summaryHeader}>
            <View style={localStyles.monthSwitcher}>
              <IconButton
                accessibilityLabel="Previous month"
                disabled={atMinimumMonth}
                icon="chevron-back"
                onPress={() => moveMonth(-1)}
                size="sm"
                tone="primary"
              />

              <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.monthLabel}>
                {formatMonthLabel(monthKey)}
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

            <PillTabs
              accessibilityLabel="Expense range"
              onChange={selectRange}
              options={rangeOptions}
              style={localStyles.rangePillTrack}
              value={range}
            />
          </View>

          <Animated.View style={[localStyles.userDependentSummary, drillAnimatedStyle]}>
            <MetricTile
              helper={stats.count > 0 ? `${formatMonthLabel(loadedMonthKey || monthKey)} · ${stats.count} records` : 'No expenses this month'}
              icon="sparkles-outline"
              label="Monthly Total"
              value={formatYen(stats.totalYen)}
            />
            {refreshing ? (
              <View style={localStyles.refreshRow}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={styles.muted}>{isSwitchingMonth ? 'Updating...' : 'Syncing...'}</Text>
              </View>
            ) : null}

            <View style={localStyles.categoryHeader}>
              <Text style={styles.h2}>Category Share</Text>
            </View>
            <PieChart categories={stats.categories} onCategoryPress={openCategoryTrend} totalYen={stats.totalYen} />
          </Animated.View>
        </BentoCard>

        <BentoCard variant="chart">
          <View style={localStyles.dailyTrendHeader}>
            <View style={localStyles.dailyTrendTitle}>
              <Text style={styles.h2}>Daily Trend</Text>
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
  categoryHeader: {
    alignItems: 'center'
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
  monthLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
    maxWidth: 82
  },
  monthSwitcher: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4
  },
  pageHeader: {
    gap: 4
  },
  rangePillTrack: {
    flex: 1,
    maxWidth: 176,
    minWidth: 104
  },
  refreshRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between'
  },
  summarySection: {
    gap: 18
  },
  userDependentSummary: {
    gap: 18
  }
});
