import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CategoryTrendModal } from '@/src/components/CategoryTrendModal';
import { DailyChart, type DailyChartMode } from '@/src/components/DailyChart';
import { PieChart } from '@/src/components/PieChart';
import { colors, styles } from '@/src/components/styles';
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
};

const CHART_MODES: { label: string; value: DailyChartMode }[] = [
  { label: '曲线', value: 'curve' },
  { label: '柱状', value: 'bar' }
];

const RANGE_VALUES: DashboardRange[] = ['all', 'current', 'other'];
const RANGE_SEGMENT_WIDTH = `${100 / RANGE_VALUES.length}%` as `${number}%`;
const SWIPE_DISTANCE = 36;
const SWIPE_DIRECTION_RATIO = 2.5;
const SWIPE_VELOCITY = 0.35;
const SWIPE_VELOCITY_RATIO = 1.5;

export default function DashboardScreen() {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [range, setRange] = useState<DashboardRange>('all');
  const [chartMode, setChartMode] = useState<DailyChartMode>('curve');
  const [selectedCategory, setSelectedCategory] = useState<CategoryStat | null>(null);
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
    { label: '双方', value: 'all' },
    { label: currentUserName, value: 'current' },
    { label: otherUserId ? otherUserName : '对方', value: 'other' }
  ];
  const selectedRangeIndex = Math.max(0, RANGE_VALUES.indexOf(range));
  const selectedRangeLeft = `${selectedRangeIndex * (100 / RANGE_VALUES.length)}%` as `${number}%`;
  const atCurrentMonth = compareMonthKeys(monthKey, currentMonthKey()) >= 0;
  const atMinimumMonth = minimumMonthKey ? compareMonthKeys(monthKey, minimumMonthKey) <= 0 : false;
  const isSwitchingMonth = refreshing && Boolean(loadedMonthKey && loadedMonthKey !== monthKey);

  useEffect(() => {
    if (range === 'other' && !otherUserId) {
      setRange('all');
    }
  }, [otherUserId, range]);

  const moveMonth = useCallback((amount: number) => {
    setMonthKey((current) => addMonths(current, amount));
  }, []);

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
        <View>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.muted}>{ledger ? ledger.name : '共享账本'}</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={[styles.section, localStyles.summarySection]} {...monthSwipeResponder.panHandlers}>
          <View style={localStyles.summaryHeader}>
            <View style={localStyles.monthSwitcher}>
              <Pressable
                disabled={atMinimumMonth}
                onPress={() => moveMonth(-1)}
                style={({ pressed }) => [
                  localStyles.compactIconButton,
                  atMinimumMonth && localStyles.disabledButton,
                  pressed && !atMinimumMonth && localStyles.pressed
                ]}
              >
                <Ionicons color={atMinimumMonth ? colors.muted : colors.primaryDark} name="chevron-back" size={18} />
              </Pressable>

              <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.monthLabel}>
                {formatMonthLabel(monthKey)}
              </Text>

              <Pressable
                disabled={atCurrentMonth}
                onPress={() => moveMonth(1)}
                style={({ pressed }) => [
                  localStyles.compactIconButton,
                  atCurrentMonth && localStyles.disabledButton,
                  pressed && !atCurrentMonth && localStyles.pressed
                ]}
              >
                <Ionicons color={atCurrentMonth ? colors.muted : colors.primaryDark} name="chevron-forward" size={18} />
              </Pressable>
            </View>

            <View style={localStyles.rangePillTrack}>
              <View style={[localStyles.rangePillIndicator, { left: selectedRangeLeft }]} />
              {rangeOptions.map((option) => {
                const selected = range === option.value;
                const disabled = option.value === 'other' && !otherUserId;
                return (
                  <Pressable
                    disabled={disabled}
                    key={option.value}
                    onPress={() => setRange(option.value)}
                    style={({ pressed }) => [
                      localStyles.rangePill,
                      disabled && localStyles.disabledButton,
                      pressed && !disabled && localStyles.pressed
                    ]}
                  >
                    <Text
                      ellipsizeMode="tail"
                      numberOfLines={1}
                      style={[
                        localStyles.rangePillText,
                        selected && localStyles.rangePillTextActive,
                        disabled && localStyles.disabledText
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={localStyles.totalSummary}>
            <View style={localStyles.totalLabelRow}>
              <Text style={styles.label}>月度总支出</Text>
              {refreshing ? <ActivityIndicator color={colors.primary} size="small" /> : null}
            </View>
            <Text style={localStyles.totalAmount}>{formatYen(stats.totalYen)}</Text>
            <Text style={[styles.muted, localStyles.centerText]}>
              {stats.count > 0 ? `${formatMonthLabel(loadedMonthKey || monthKey)} ${stats.count} 笔` : '这个月还没有支出记录'}
            </Text>
            {isSwitchingMonth ? <Text style={[styles.muted, localStyles.centerText]}>正在更新...</Text> : null}
          </View>

          <View style={localStyles.categoryHeader}>
            <Text style={styles.h2}>类别占比</Text>
          </View>
          <PieChart categories={stats.categories} onCategoryPress={setSelectedCategory} totalYen={stats.totalYen} />
        </View>

        <View style={styles.section}>
          <View style={styles.between}>
            <Text style={styles.h2}>每日趋势</Text>
            {isSwitchingMonth ? <Text style={styles.muted}>更新中</Text> : null}
          </View>

          <View style={styles.row}>
            {CHART_MODES.map((mode) => {
              const selected = chartMode === mode.value;
              return (
                <Pressable
                  key={mode.value}
                  onPress={() => setChartMode(mode.value)}
                  style={[styles.chip, selected && styles.chipActive]}
                >
                  <Text style={styles.chipText}>{mode.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <DailyChart mode={chartMode} series={stats.dailySeries} />
        </View>
      </ScrollView>

      <CategoryTrendModal
        category={selectedCategory}
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
  centerText: {
    textAlign: 'center'
  },
  compactIconButton: {
    alignItems: 'center',
    backgroundColor: colors.tint,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28
  },
  disabledButton: {
    opacity: 0.45
  },
  disabledText: {
    color: colors.muted
  },
  monthLabel: {
    color: colors.ink,
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
  pressed: {
    opacity: 0.75
  },
  rangePill: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    paddingHorizontal: 6,
    zIndex: 1
  },
  rangePillIndicator: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 8,
    borderWidth: 1,
    bottom: 3,
    position: 'absolute',
    top: 3,
    width: RANGE_SEGMENT_WIDTH
  },
  rangePillText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center'
  },
  rangePillTextActive: {
    color: colors.primaryDark,
    fontWeight: '900'
  },
  rangePillTrack: {
    backgroundColor: colors.tint,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    height: 34,
    maxWidth: 176,
    minWidth: 104,
    overflow: 'hidden',
    position: 'relative'
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
  totalAmount: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center'
  },
  totalLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 22
  },
  totalSummary: {
    alignItems: 'center',
    gap: 4,
    paddingTop: 2
  }
});
