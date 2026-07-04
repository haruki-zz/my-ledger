import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue
} from 'react-native-reanimated';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryDetailSheet } from '@/src/components/CategoryDetailSheet';
import { DashboardCategoryShare } from '@/src/components/DashboardCategoryShare';
import { DashboardDailyActivity } from '@/src/components/DashboardDailyActivity';
import { motionCardResizeTransition } from '@/src/components/motion';
import { SlidingValueText } from '@/src/components/SlidingValueText';
import { colors, fontFamilies, styles } from '@/src/components/styles';
import { TransferSettleEntry } from '@/src/components/TransferSettleEntry';
import { BentoCard } from '@/src/components/ui';
import { useDashboardData } from '@/src/hooks/useDashboardData';
import { useTransferChecklist } from '@/src/hooks/useTransferChecklist';
import { categoryColor, categoryLabel } from '@/src/lib/categorySystem';
import { buildUserColorMap, colorForDarkSurface, DEFAULT_PARTNER_COLOR, DEFAULT_USER_COLOR } from '@/src/lib/entityColors';
import { DEFAULT_LEDGER_TIME_ZONE, displayName, formatCompactYen, formatYen, todayDateString } from '@/src/lib/format';
import { motionDuration, motionEasings, useReduceMotion } from '@/src/lib/motion';
import { getSpendComparisonPresentation } from '@/src/lib/spendComparison';
import { isIntentionalMonthSwipe } from '@/src/lib/swipe';
import {
  addMonths,
  amountForUser,
  buildDashboardHeatDays,
  currentMonthKey,
  expenseCategoryId,
  monthEndDateString,
  monthKeyFromDateString,
  monthStartDateString,
  resolveDashboardPeriodNavigation,
  type CategoryStat,
  type DashboardPeriod,
  type DashboardPeriodStats
} from '@/src/lib/stats';
import type { Expense } from '@/src/types/database';

const HERO_FLIP_DURATION_MS = 900;
const PERIOD_OPTIONS: { shortLabel: string; label: string; value: DashboardPeriod }[] = [
  { shortLabel: 'D', label: 'Day', value: 'today' },
  { shortLabel: 'W', label: 'Week', value: 'week' },
  { shortLabel: 'M', label: 'Month', value: 'month' }
];

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const currentDashboardMonthKey = currentMonthKey();
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [jumpSheetOpen, setJumpSheetOpen] = useState(false);
  const [periodDragHandled, setPeriodDragHandled] = useState(false);
  const heroFlipProgress = useSharedValue(0);
  const {
    ledger,
    members,
    currentUserId,
    otherUserId,
    minimumMonthKey,
    settledExpenses,
    combinedStats,
    personalStats,
    stats,
    error,
    reload
  } = useDashboardData(currentDashboardMonthKey, period, periodOffset, flipped);
  const {
    items: transferItems,
    loading: transferLoading,
    saving: transferSaving,
    error: transferError,
    reload: reloadTransfers,
    setConfirmations
  } = useTransferChecklist(members.length >= 2 ? ledger?.id || null : null);

  const currentUserName = displayName(members.find((member) => member.user_id === currentUserId)?.profile.display_name);
  const otherUserName = displayName(members.find((member) => member.user_id === otherUserId)?.profile.display_name);
  const combinedMemberStats = combinedStats.memberTotals;
  const currentMemberStat = combinedMemberStats.find((member) => member.userId === currentUserId);
  const otherMemberStat = combinedMemberStats.find((member) => member.userId === otherUserId);
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
      today: ledgerTodayString,
      viewerUserId: flipped ? null : currentUserId
    })
  ), [currentUserId, flipped, heatmapMonthKey, ledgerTodayString, members, settledExpenses]);
  const selectedCategoryDetail = useMemo(() => (
    selectedCategoryKey
      ? stats.getCategoryDetail(selectedCategoryKey)
      : null
  ), [selectedCategoryKey, stats]);
  const scopedRecentExpenses = useMemo(() => (
    buildRecentExpenses({
      expenses: settledExpenses,
      todayString: ledgerTodayString,
      viewerUserId: flipped ? null : currentUserId
    })
  ), [currentUserId, flipped, ledgerTodayString, settledExpenses]);
  const paceData = useMemo(() => (
    buildPaceData({
      expenses: settledExpenses,
      monthKey: heatmapMonthKey,
      todayString: ledgerTodayString,
      viewerUserId: flipped ? null : currentUserId
    })
  ), [currentUserId, flipped, heatmapMonthKey, ledgerTodayString, settledExpenses]);
  const jumpMonths = useMemo(() => (
    Array.from({ length: 6 }, (_, index) => {
      const offset = index - 5;
      const monthKey = addMonths(currentDashboardMonthKey, offset);
      return {
        label: formatJumpMonthLabel(monthKey),
        monthKey,
        offset
      };
    })
  ), [currentDashboardMonthKey]);
  const heroResize = motionCardResizeTransition(reduceMotion);

  const closeCategoryDetail = useCallback(() => {
    setSelectedCategoryKey(null);
  }, []);

  const toggleHeroFlip = useCallback(() => {
    setFlipped((current) => !current);
    setSelectedCategoryKey(null);
  }, []);

  useEffect(() => {
    heroFlipProgress.value = withTiming(flipped ? 1 : 0, {
      duration: motionDuration(HERO_FLIP_DURATION_MS, reduceMotion),
      easing: motionEasings.emphasize
    });
  }, [flipped, heroFlipProgress, reduceMotion]);

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

  const resetPeriodOffset = useCallback(() => {
    setSelectedCategoryKey(null);
    setPeriodOffset(0);
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

  function openJumpSheet() {
    setJumpSheetOpen(true);
  }

  function closeJumpSheet() {
    setJumpSheetOpen(false);
  }

  function jumpToday() {
    resetPeriodOffset();
    closeJumpSheet();
  }

  function jumpMonth(offset: number) {
    setSelectedCategoryKey(null);
    setPeriod('month');
    setPeriodOffset(offset);
    closeJumpSheet();
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

  const periodSwipeResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return isIntentionalMonthSwipe(
        gestureState.dx,
        gestureState.dy,
        gestureState.vx,
        gestureState.vy
      );
    },
    onPanResponderGrant: () => {
      setPeriodDragHandled(false);
    },
    onPanResponderRelease: (_, gestureState) => {
      if (!isIntentionalMonthSwipe(gestureState.dx, gestureState.dy, gestureState.vx, gestureState.vy)) {
        return;
      }

      if (gestureState.dx > 0 && periodNavigation.canGoPrevious) {
        setPeriodDragHandled(true);
        movePeriod(-1);
      }

      if (gestureState.dx < 0 && periodNavigation.canGoNext) {
        setPeriodDragHandled(true);
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

          <View style={localStyles.heroZone}>
            <Animated.View layout={heroResize}>
              <BentoCard variant="hero" style={localStyles.heroCard}>
                <View style={localStyles.heroTop} {...periodSwipeResponder.panHandlers}>
                  <View style={localStyles.heroSwitch}>
                    <Pressable
                      accessibilityHint="Opens the Jump to sheet. Swipe left or right on this row to change period."
                      accessibilityLabel={`Jump to ${periodNavigation.label}`}
                      accessibilityRole="button"
                      onPress={() => {
                        if (periodDragHandled) {
                          setPeriodDragHandled(false);
                          return;
                        }
                        openJumpSheet();
                      }}
                      style={({ pressed }) => [localStyles.heroTitleButton, pressed && localStyles.heroTitleButtonPressed]}
                    >
                      <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.heroMonth}>
                        {periodNavigation.label}
                      </Text>
                      <Ionicons color="rgba(255,253,247,0.50)" name="chevron-down" size={13} />
                    </Pressable>
                    {periodOffset !== 0 ? (
                      <Pressable
                        accessibilityLabel="Show current period"
                        accessibilityRole="button"
                        onPress={resetPeriodOffset}
                        style={({ pressed }) => [localStyles.periodResetDot, pressed && localStyles.periodResetDotPressed]}
                      />
                    ) : null}
                  </View>

                  <PeriodSegment onChange={selectPeriod} period={period} />
                </View>

                <HeroFlipZone
                  backFace={(
                    <HeroFaceContent
                      comparison={comparisonBadgeForDirection(combinedStats.comparison.direction)}
                      currentUserColor={currentUserColorOnDark}
                      currentUserName={currentUserName}
                      currentUserTotalYen={currentMemberStat?.amountYen || 0}
                      otherUserColor={otherUserColorOnDark}
                      otherUserId={otherUserId}
                      otherUserName={otherUserName}
                      otherUserTotalYen={otherMemberStat?.amountYen || 0}
                      scope="combined"
                      stats={combinedStats}
                    />
                  )}
                  canFlip={Boolean(otherUserId)}
                  frontFace={(
                    <HeroFaceContent
                      comparison={comparisonBadgeForDirection(personalStats.comparison.direction)}
                      currentUserColor={currentUserColorOnDark}
                      currentUserName={currentUserName}
                      currentUserTotalYen={currentMemberStat?.amountYen || 0}
                      otherUserColor={otherUserColorOnDark}
                      otherUserId={otherUserId}
                      otherUserName={otherUserName}
                      otherUserTotalYen={otherMemberStat?.amountYen || 0}
                      scope="personal"
                      stats={personalStats}
                    />
                  )}
                  flipped={flipped}
                  onToggle={toggleHeroFlip}
                  otherUserName={otherUserName}
                  progress={heroFlipProgress}
                />

                {members.length >= 2 ? (
                  <TransferSettleEntry
                    currentUserId={currentUserId}
                    error={transferError}
                    items={transferItems}
                    loading={transferLoading}
                    members={members}
                    onSetConfirmations={setConfirmations}
                    saving={transferSaving}
                  />
                ) : null}
              </BentoCard>
            </Animated.View>
          </View>

          <View style={localStyles.insightGrid}>
            <DashboardRecentCard items={scopedRecentExpenses} />
            <DashboardPaceCard data={paceData} />
          </View>

          <DashboardDailyActivity
            barAnimationDurationMs={HERO_FLIP_DURATION_MS}
            days={heatDays}
            monthKey={heatmapMonthKey}
            onViewHistoryDate={viewHistoryDate}
            todayString={ledgerTodayString}
          />

          <DashboardCategoryShare
            categories={stats.categories}
            colorAnimationDurationMs={HERO_FLIP_DURATION_MS}
            onCategoryPress={openCategoryDetail}
            selectedCategoryKey={selectedCategoryKey}
            totalYen={stats.totalYen}
          />

        </View>
      </ScrollView>

      <CategoryDetailSheet
        detail={selectedCategoryDetail}
        members={members}
        onClose={closeCategoryDetail}
      />
      <JumpToSheet
        activeMonthOffset={period === 'month' ? periodOffset : null}
        months={jumpMonths}
        onClose={closeJumpSheet}
        onJumpMonth={jumpMonth}
        onToday={jumpToday}
        visible={jumpSheetOpen}
      />
    </>
  );
}

function PeriodSegment({
  onChange,
  period
}: {
  onChange: (period: DashboardPeriod) => void;
  period: DashboardPeriod;
}) {
  const reduceMotion = useReduceMotion();
  const layout = motionCardResizeTransition(reduceMotion);

  return (
    <Animated.View layout={layout} style={localStyles.periodSegment}>
      {PERIOD_OPTIONS.map((option) => {
        const active = option.value === period;
        return (
          <Animated.View key={option.value} layout={layout}>
            <Pressable
            accessibilityLabel={`Show ${periodLabel(option.value)} dashboard`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              localStyles.periodOption,
              active && localStyles.periodOptionActive,
              pressed && !active && localStyles.periodOptionPressed
            ]}
          >
            <Text style={[localStyles.periodText, active && localStyles.periodTextActive]}>
              {active ? option.label : option.shortLabel}
            </Text>
          </Pressable>
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

type RecentExpenseItem = {
  amountYen: number;
  color: string;
  id: string;
  label: string;
  relativeTime: string;
};

type RecentExpenseItemWithSort = RecentExpenseItem & {
  sortKey: string;
};

type PaceData = {
  currentPoints: string;
  currentTotalYen: number;
  dot: { x: number; y: number };
  ghostPoints: string;
  projectionPoints: string;
  projectedYen: number;
};

function DashboardRecentCard({ items }: { items: RecentExpenseItem[] }) {
  return (
    <BentoCard style={localStyles.insightCard}>
      <View style={localStyles.insightHeader}>
        <View style={localStyles.insightTick} />
        <Text style={localStyles.insightTitle}>RECENT</Text>
      </View>
      <View style={localStyles.recentList}>
        {items.length > 0 ? items.map((item) => (
          <View key={item.id} style={localStyles.recentRow}>
            <View style={[localStyles.recentDot, { backgroundColor: item.color }]} />
            <View style={localStyles.recentTextBlock}>
              <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.recentName}>
                {item.label}
              </Text>
              <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.recentTime}>
                {item.relativeTime}
              </Text>
            </View>
            <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.recentAmount}>
              {formatCompactYen(item.amountYen)}
            </Text>
          </View>
        )) : (
          <View style={localStyles.emptyInsight}>
            <Text style={localStyles.emptyInsightTitle}>No recent records</Text>
            <Text style={localStyles.emptyInsightText}>New expenses will appear here.</Text>
          </View>
        )}
      </View>
    </BentoCard>
  );
}

function DashboardPaceCard({ data }: { data: PaceData }) {
  return (
    <BentoCard style={localStyles.insightCard}>
      <View style={localStyles.insightHeader}>
        <View style={localStyles.insightTick} />
        <Text style={localStyles.insightTitle}>PACE</Text>
      </View>
      <View style={localStyles.paceChart}>
        <Svg height={72} viewBox="0 0 132 72" width="100%">
          <Line stroke="rgba(42,39,34,0.08)" strokeWidth={1} x1={4} x2={128} y1={62} y2={62} />
          <Polyline
            fill="none"
            points={data.ghostPoints}
            stroke="rgba(42,39,34,0.22)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
          <Polyline
            fill="none"
            points={data.projectionPoints}
            stroke="rgba(192,137,46,0.48)"
            strokeDasharray="4 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
          <Polyline
            fill="none"
            points={data.currentPoints}
            stroke="#C0892E"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
          <Circle cx={data.dot.x} cy={data.dot.y} fill="#FFFDF7" r={4.5} stroke="#C0892E" strokeWidth={2} />
        </Svg>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={localStyles.paceLabel}>
        on pace for {formatCompactYen(data.projectedYen)}
      </Text>
    </BentoCard>
  );
}

function JumpToSheet({
  activeMonthOffset,
  months,
  onClose,
  onJumpMonth,
  onToday,
  visible
}: {
  activeMonthOffset: number | null;
  months: { label: string; monthKey: string; offset: number }[];
  onClose: () => void;
  onJumpMonth: (offset: number) => void;
  onToday: () => void;
  visible: boolean;
}) {
  const sheetPanResponder = useMemo(() => (
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 42) {
          onClose();
        }
      },
      onPanResponderTerminationRequest: () => true
    })
  ), [onClose]);

  if (!visible) {
    return null;
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <Pressable style={localStyles.jumpScrim} onPress={onClose}>
        <Pressable
          accessibilityLabel="Jump to period"
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={localStyles.jumpSheet}
        >
          <View style={localStyles.jumpHandleHitArea} {...sheetPanResponder.panHandlers}>
            <View style={localStyles.jumpHandle} />
          </View>
          <Text style={localStyles.jumpTitle}>Jump to</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onToday}
            style={({ pressed }) => [localStyles.jumpTodayButton, pressed && localStyles.jumpPressed]}
          >
            <Ionicons color="#3A322A" name="today-outline" size={18} />
            <Text style={localStyles.jumpTodayText}>Today</Text>
          </Pressable>
          <View style={localStyles.jumpMonthGrid}>
            {months.map((month) => {
              const active = activeMonthOffset === month.offset;
              return (
                <Pressable
                  accessibilityLabel={`Show ${month.label}`}
                  accessibilityRole="button"
                  key={month.monthKey}
                  onPress={() => onJumpMonth(month.offset)}
                  style={({ pressed }) => [
                    localStyles.jumpMonthButton,
                    active && localStyles.jumpMonthButtonActive,
                    pressed && localStyles.jumpPressed
                  ]}
                >
                  <Text style={[localStyles.jumpMonthText, active && localStyles.jumpMonthTextActive]}>
                    {month.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function HeroFlipZone({
  backFace,
  canFlip,
  frontFace,
  flipped,
  onToggle,
  otherUserName,
  progress
}: {
  backFace: ReactNode;
  canFlip: boolean;
  frontFace: ReactNode;
  flipped: boolean;
  onToggle: () => void;
  otherUserName: string;
  progress: SharedValue<number>;
}) {
  const [frontFaceHeight, setFrontFaceHeight] = useState(0);
  const [backFaceHeight, setBackFaceHeight] = useState(0);
  const hasMeasuredFaces = frontFaceHeight > 0 && backFaceHeight > 0;
  const rotorShellStyle = useAnimatedStyle(() => {
    const fallbackHeight = frontFaceHeight || backFaceHeight || 96;
    return {
      height: canFlip && hasMeasuredFaces
        ? interpolate(progress.value, [0, 1], [frontFaceHeight, backFaceHeight], Extrapolation.CLAMP)
        : fallbackHeight
    };
  });
  const frontFaceStyle = useAnimatedStyle(() => ({
    opacity: progress.value < 0.5 ? 1 : 0,
    transform: [
      { perspective: 1100 },
      { rotateY: `${progress.value * 180}deg` }
    ]
  }));
  const backFaceStyle = useAnimatedStyle(() => ({
    opacity: progress.value >= 0.5 ? 1 : 0,
    transform: [
      { perspective: 1100 },
      { rotateY: `${-180 + progress.value * 180}deg` }
    ]
  }));

  if (!canFlip) {
    return <View>{frontFace}</View>;
  }

  return (
    <View style={localStyles.heroFlipShell}>
      <View pointerEvents="none" style={localStyles.heroFaceMeasurer}>
        <View onLayout={(event) => setFrontFaceHeight(event.nativeEvent.layout.height)}>
          {frontFace}
        </View>
        <View onLayout={(event) => setBackFaceHeight(event.nativeEvent.layout.height)}>
          {backFace}
        </View>
      </View>

      <Pressable
        accessibilityHint="Flips between your spending only and combined spending with your partner"
        accessibilityLabel={flipped ? 'Show only your spending' : `Show combined spending with ${otherUserName}`}
        accessibilityRole="button"
        onPress={onToggle}
        style={localStyles.heroFlipPressable}
      >
        <Animated.View style={[localStyles.heroFlipViewport, rotorShellStyle]}>
          <Animated.View style={[localStyles.heroFace, frontFaceStyle]}>
            {frontFace}
          </Animated.View>
          <Animated.View style={[localStyles.heroFace, backFaceStyle]}>
            {backFace}
          </Animated.View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

type ComparisonBadgePresentation = {
  badgeBackgroundColor: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
};

function HeroFaceContent({
  comparison,
  currentUserColor,
  currentUserName,
  currentUserTotalYen,
  otherUserColor,
  otherUserId,
  otherUserName,
  otherUserTotalYen,
  scope,
  stats
}: {
  comparison: ComparisonBadgePresentation;
  currentUserColor: string;
  currentUserName: string;
  currentUserTotalYen: number;
  otherUserColor: string;
  otherUserId: string | null;
  otherUserName: string;
  otherUserTotalYen: number;
  scope: 'combined' | 'personal';
  stats: DashboardPeriodStats;
}) {
  return (
    <View style={localStyles.heroFaceContent}>
      <View style={localStyles.heroScopeRow}>
        <HeroScopePill
          currentUserColor={currentUserColor}
          currentUserName={currentUserName}
          otherUserColor={otherUserColor}
          scope={scope}
        />
        <Text style={localStyles.heroRecordCount}>
          {formatRecordCount(stats.count)}
        </Text>
      </View>

      <View style={localStyles.heroAmountRow}>
        <View style={localStyles.heroAmountBlock}>
          <SlidingValueText
            formatValue={formatYen}
            textStyle={localStyles.heroAmount}
            value={stats.totalYen}
            wrapperStyle={localStyles.heroAmountSlot}
          />
        </View>
        <View style={localStyles.comparisonStack}>
          <View style={localStyles.comparisonTopLine}>
            <Ionicons
              color={comparison.color}
              name={comparison.icon}
              size={13}
            />
            <SlidingValueText
              formatValue={formatComparisonAmount}
              textStyle={[localStyles.comparisonAmountText, { color: comparison.color }]}
              value={Math.abs(stats.comparison.deltaYen)}
              wrapperStyle={localStyles.comparisonAmountSlot}
            />
            <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.comparisonText}>
              {stats.comparison.label}
            </Text>
          </View>
          <View style={[localStyles.percentBadge, { backgroundColor: comparison.badgeBackgroundColor }]}>
            <Text style={[localStyles.percentBadgeText, { color: comparison.color }]}>
              {formatComparisonPercentage(stats.comparison.percentage)}
            </Text>
          </View>
        </View>
      </View>

      {scope === 'combined' ? (
        <View style={localStyles.heroSecondary}>
          <View style={localStyles.memberSplitRow}>
            <MemberSplit
              amountYen={currentUserTotalYen}
              color={currentUserColor}
              label={currentUserName}
            />
            {otherUserId ? (
              <>
                <View style={localStyles.memberDivider} />
                <MemberSplit
                  amountYen={otherUserTotalYen}
                  color={otherUserColor}
                  label={otherUserName}
                />
              </>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function HeroScopePill({
  currentUserColor,
  currentUserName,
  otherUserColor,
  scope
}: {
  currentUserColor: string;
  currentUserName: string;
  otherUserColor: string;
  scope: 'combined' | 'personal';
}) {
  return (
    <View style={localStyles.heroScopePill}>
      {scope === 'personal' ? (
        <View style={[localStyles.heroScopeDot, { backgroundColor: currentUserColor }]} />
      ) : (
        <View style={localStyles.heroTogetherDots}>
          <View style={[localStyles.heroScopeDot, { backgroundColor: currentUserColor }]} />
          <View style={[localStyles.heroScopeDot, localStyles.heroScopeDotOverlap, { backgroundColor: otherUserColor }]} />
        </View>
      )}
      <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.heroScopeText}>
        {scope === 'personal' ? displayName(currentUserName) : 'Together'}
      </Text>
      <Ionicons color="rgba(255,253,247,0.48)" name="swap-horizontal" size={12} />
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
      <View style={localStyles.memberName}>
        <View style={[localStyles.memberDot, { backgroundColor: color }]} />
        <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.memberNameText}>
          {displayName(label)}
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

function periodLabel(period: DashboardPeriod) {
  if (period === 'today') {
    return 'today';
  }

  if (period === 'week') {
    return 'week';
  }

  return 'month';
}

function comparisonBadgeForDirection(direction: DashboardPeriodStats['comparison']['direction']): ComparisonBadgePresentation {
  if (direction === 'over') {
    return {
      badgeBackgroundColor: 'rgba(232,149,123,0.16)',
      color: '#E8957B',
      icon: 'caret-up'
    };
  }

  if (direction === 'under') {
    return {
      badgeBackgroundColor: 'rgba(95,184,178,0.16)',
      color: '#7FC4BE',
      icon: 'caret-down'
    };
  }

  const presentation = getSpendComparisonPresentation(direction, {
    neutralIcon: 'remove',
    tone: 'onDark'
  });

  return {
    badgeBackgroundColor: 'rgba(255,253,247,0.12)',
    color: presentation.color,
    icon: presentation.icon
  };
}

function formatRecordCount(count: number) {
  return `${count} ${count === 1 ? 'record' : 'records'}`;
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

function buildRecentExpenses(input: {
  expenses: Expense[];
  todayString: string;
  viewerUserId: string | null;
}): RecentExpenseItem[] {
  const items: RecentExpenseItemWithSort[] = [];
  for (const expense of input.expenses) {
    const amountYen = input.viewerUserId ? amountForUser(expense, input.viewerUserId) : expense.amount_yen;
    if (amountYen <= 0) {
      continue;
    }

    const categoryId = expenseCategoryId(expense);
    items.push({
        amountYen,
        color: categoryColor(categoryId),
        id: expense.id,
        label: expense.subcategory || categoryLabel(categoryId),
        relativeTime: formatRelativeExpenseDate(expense.spent_on, input.todayString),
        sortKey: `${expense.spent_on}T${expense.created_at || expense.updated_at || ''}`
    });
  }

  return items
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    .slice(0, 3)
    .map(({ sortKey, ...item }) => item);
}

function buildPaceData(input: {
  expenses: Expense[];
  monthKey: string;
  todayString: string;
  viewerUserId: string | null;
}): PaceData {
  const previousMonthKey = addMonths(input.monthKey, -1);
  const monthDays = Number(monthEndDateString(input.monthKey).slice(8, 10));
  const selectedMonthIsCurrent = input.monthKey === monthKeyFromDateString(input.todayString);
  const elapsedDays = selectedMonthIsCurrent
    ? Math.min(Number(input.todayString.slice(8, 10)), monthDays)
    : monthDays;
  const currentDaily = dailyAmountsForMonth(input.expenses, input.monthKey, input.viewerUserId);
  const previousDaily = dailyAmountsForMonth(input.expenses, previousMonthKey, input.viewerUserId);
  const currentCumulative = cumulativeAmounts(currentDaily, elapsedDays);
  const previousCumulative = cumulativeAmounts(previousDaily, Number(monthEndDateString(previousMonthKey).slice(8, 10)));
  const currentTotalYen = currentCumulative[currentCumulative.length - 1] || 0;
  const projectedYen = elapsedDays > 0 ? Math.round((currentTotalYen / elapsedDays) * monthDays) : 0;
  const maxYen = Math.max(projectedYen, currentTotalYen, ...previousCumulative, 1);
  const pointFor = (day: number, value: number) => {
    const x = 4 + ((Math.max(1, day) - 1) / Math.max(1, monthDays - 1)) * 124;
    const y = 62 - (value / maxYen) * 52;
    return { x: roundPoint(x), y: roundPoint(y) };
  };
  const currentPoints = currentCumulative
    .map((value, index) => pointFor(index + 1, value))
    .map(pointToString)
    .join(' ');
  const ghostPoints = previousCumulative
    .slice(0, monthDays)
    .map((value, index) => pointFor(index + 1, value))
    .map(pointToString)
    .join(' ');
  const startProjection = pointFor(Math.max(1, elapsedDays), currentTotalYen);
  const endProjection = pointFor(monthDays, projectedYen);

  return {
    currentPoints: currentPoints || pointToString(pointFor(1, 0)),
    currentTotalYen,
    dot: startProjection,
    ghostPoints: ghostPoints || pointToString(pointFor(1, 0)),
    projectionPoints: `${pointToString(startProjection)} ${pointToString(endProjection)}`,
    projectedYen
  };
}

function dailyAmountsForMonth(expenses: Expense[], monthKey: string, viewerUserId: string | null) {
  const days = Number(monthEndDateString(monthKey).slice(8, 10));
  const amounts = Array.from({ length: days }, () => 0);
  for (const expense of expenses) {
    if (monthKeyFromDateString(expense.spent_on) !== monthKey) {
      continue;
    }

    const day = Number(expense.spent_on.slice(8, 10));
    amounts[day - 1] += viewerUserId ? amountForUser(expense, viewerUserId) : expense.amount_yen;
  }
  return amounts;
}

function cumulativeAmounts(amounts: number[], count: number) {
  const result: number[] = [];
  let runningTotal = 0;
  for (let index = 0; index < Math.min(count, amounts.length); index += 1) {
    runningTotal += amounts[index] || 0;
    result.push(runningTotal);
  }
  return result;
}

function pointToString(point: { x: number; y: number }) {
  return `${point.x},${point.y}`;
}

function roundPoint(value: number) {
  return Math.round(value * 10) / 10;
}

function formatRelativeExpenseDate(dateString: string, todayString: string) {
  const delta = daysBetweenDateStrings(dateString, todayString);
  if (delta === 0) {
    return 'Today';
  }
  if (delta === 1) {
    return 'Yesterday';
  }
  if (delta > 1 && delta < 7) {
    return `${delta}d ago`;
  }
  return formatShortDate(dateString);
}

function daysBetweenDateStrings(startDateString: string, endDateString: string) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((parseDateString(endDateString).getTime() - parseDateString(startDateString).getTime()) / millisecondsPerDay);
}

function parseDateString(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatShortDate(dateString: string) {
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(parseDateString(dateString));
}

function formatJumpMonthLabel(monthKey: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(parseDateString(monthStartDateString(monthKey)));
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
  comparisonStack: {
    alignItems: 'flex-end',
    gap: 6,
    justifyContent: 'center',
    maxWidth: 152,
    paddingBottom: 3,
    paddingTop: 3
  },
  comparisonTopLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'flex-end',
    maxWidth: 152
  },
  comparisonText: {
    color: 'rgba(255,253,247,0.66)',
    fontFamily: fontFamilies.regular,
    fontSize: 10.5,
    flexShrink: 1,
    lineHeight: 13,
    maxWidth: 82,
    textAlign: 'right'
  },
  content: {
    gap: 0
  },
  dashboardContent: {
    gap: 13
  },
  emptyInsight: {
    gap: 4,
    justifyContent: 'center',
    minHeight: 82
  },
  emptyInsightText: {
    color: colors.subtle,
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 14
  },
  emptyInsightTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16
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
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  heroAmountSlot: {
    height: 40,
    marginTop: 0
  },
  heroCard: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderRadius: 22,
    boxShadow: '0 20px 40px -20px rgba(42,39,34,0.55)',
    gap: 0,
    minHeight: 0,
    overflow: 'hidden',
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 11
  },
  heroFace: {
    backfaceVisibility: 'hidden',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  heroFaceContent: {
    gap: 13
  },
  heroFaceMeasurer: {
    left: 0,
    opacity: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: -1
  },
  heroFlipPressable: {
    minHeight: 44
  },
  heroFlipShell: {
    position: 'relative'
  },
  heroFlipViewport: {
    overflow: 'visible',
    position: 'relative'
  },
  heroMonth: {
    color: '#FFFDF7',
    flexShrink: 1,
    fontFamily: fontFamilies.extraBold,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
    maxWidth: 170,
    minWidth: 0,
    textAlign: 'left'
  },
  heroSecondary: {
    backgroundColor: 'rgba(255,253,247,0.05)',
    borderRadius: 14,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  heroRecordCount: {
    color: 'rgba(255,253,247,0.44)',
    flexShrink: 0,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
    textAlign: 'right'
  },
  heroScopeDot: {
    borderRadius: 4,
    height: 8,
    width: 8
  },
  heroScopeDotOverlap: {
    marginLeft: -3
  },
  heroScopePill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,253,247,0.09)',
    borderColor: 'rgba(255,253,247,0.10)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    maxWidth: 176,
    minHeight: 26,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  heroScopeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 26
  },
  heroScopeText: {
    color: 'rgba(255,253,247,0.78)',
    flexShrink: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 15,
    minWidth: 0
  },
  heroSwitch: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minWidth: 0
  },
  heroTitleButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 5,
    maxWidth: 205,
    minHeight: 30,
    minWidth: 0,
    paddingHorizontal: 7,
    paddingVertical: 4
  },
  heroTitleButtonPressed: {
    backgroundColor: 'rgba(255,253,247,0.10)'
  },
  heroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 12
  },
  heroZone: {
    transformOrigin: 'top center'
  },
  heroTogetherDots: {
    alignItems: 'center',
    flexDirection: 'row',
    width: 13
  },
  insightCard: {
    borderRadius: 16,
    flex: 1,
    gap: 10,
    minHeight: 138,
    minWidth: 0,
    padding: 13
  },
  insightGrid: {
    flexDirection: 'row',
    gap: 10
  },
  insightHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7
  },
  insightTick: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    height: 15,
    width: 5
  },
  insightTitle: {
    color: colors.muted,
    fontFamily: fontFamilies.monoBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    lineHeight: 14
  },
  jumpHandle: {
    backgroundColor: 'rgba(42,39,34,0.22)',
    borderRadius: 999,
    height: 5,
    width: 42
  },
  jumpHandleHitArea: {
    alignItems: 'center',
    alignSelf: 'center',
    height: 24,
    justifyContent: 'center',
    marginTop: -4,
    width: 96
  },
  jumpMonthButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(42,39,34,0.05)',
    borderRadius: 13,
    height: 46,
    justifyContent: 'center',
    width: '31%'
  },
  jumpMonthButtonActive: {
    backgroundColor: colors.primary
  },
  jumpMonthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between'
  },
  jumpMonthText: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18
  },
  jumpMonthTextActive: {
    color: '#FFFDF7'
  },
  jumpPressed: {
    opacity: 0.72
  },
  jumpScrim: {
    backgroundColor: 'rgba(42,39,34,0.24)',
    flex: 1,
    justifyContent: 'flex-end'
  },
  jumpSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 14,
    paddingBottom: 26,
    paddingHorizontal: 18,
    paddingTop: 10
  },
  jumpTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 27
  },
  jumpTodayButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 50,
    paddingHorizontal: 14
  },
  jumpTodayText: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  memberAmount: {
    color: 'rgba(255,253,247,0.86)',
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 14.5,
    fontWeight: '600',
    lineHeight: 19,
    textAlign: 'left'
  },
  memberAmountSlot: {
    alignSelf: 'stretch',
    height: 19
  },
  memberDivider: {
    backgroundColor: 'rgba(255,253,247,0.10)',
    height: 32,
    width: 1
  },
  memberDot: {
    borderRadius: 2,
    height: 6,
    width: 6
  },
  memberName: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minWidth: 0
  },
  memberNameText: {
    color: 'rgba(255,253,247,0.48)',
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    minWidth: 0
  },
  memberSplit: {
    alignItems: 'stretch',
    flex: 1,
    gap: 4,
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
    minWidth: 24,
    paddingHorizontal: 8,
    zIndex: 1
  },
  periodOptionActive: {
    backgroundColor: 'rgba(255,253,247,0.92)',
    minWidth: 54
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
    overflow: 'hidden',
    padding: 3,
    position: 'relative'
  },
  periodResetDot: {
    backgroundColor: '#FFFDF7',
    borderColor: 'rgba(255,253,247,0.20)',
    borderRadius: 999,
    borderWidth: 2,
    height: 11,
    width: 11
  },
  periodResetDotPressed: {
    transform: [{ scale: 0.86 }]
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
  },
  paceChart: {
    height: 72,
    justifyContent: 'center'
  },
  paceLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15
  },
  recentAmount: {
    color: colors.ink,
    flexShrink: 0,
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    maxWidth: 55,
    textAlign: 'right'
  },
  recentDot: {
    borderRadius: 4,
    height: 8,
    width: 8
  },
  recentList: {
    gap: 8
  },
  recentName: {
    color: colors.ink,
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 15
  },
  recentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minHeight: 28
  },
  recentTextBlock: {
    flex: 1,
    minWidth: 0
  },
  recentTime: {
    color: colors.subtle,
    fontFamily: fontFamilies.regular,
    fontSize: 10.5,
    lineHeight: 13
  }
});
