import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue
} from 'react-native-reanimated';
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
import { buildUserColorMap, colorForDarkSurface, DEFAULT_PARTNER_COLOR, DEFAULT_USER_COLOR } from '@/src/lib/entityColors';
import { DEFAULT_LEDGER_TIME_ZONE, displayName, formatYen, todayDateString } from '@/src/lib/format';
import { motionDuration, motionDurations, motionEasings, useReduceMotion } from '@/src/lib/motion';
import { getSpendComparisonPresentation } from '@/src/lib/spendComparison';
import { isIntentionalMonthSwipe } from '@/src/lib/swipe';
import {
  buildDashboardHeatDays,
  currentMonthKey,
  monthKeyFromDateString,
  resolveDashboardPeriodNavigation,
  type CategoryStat,
  type DashboardPeriod,
  type DashboardPeriodStats
} from '@/src/lib/stats';

const HERO_FLIP_DURATION_MS = 900;
const PERIOD_OPTIONS: { label: string; value: DashboardPeriod }[] = [
  { label: 'D', value: 'today' },
  { label: 'W', value: 'week' },
  { label: 'M', value: 'month' }
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
  } = useTransferChecklist(ledger?.id || null);

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
            <Animated.View layout={heroResize}>
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

                <TransferSettleEntry
                  currentUserId={currentUserId}
                  error={transferError}
                  items={transferItems}
                  loading={transferLoading}
                  members={members}
                  onSetConfirmations={setConfirmations}
                  saving={transferSaving}
                />
              </BentoCard>
            </Animated.View>
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
  const selectedIndex = Math.max(0, PERIOD_OPTIONS.findIndex((option) => option.value === period));
  const [trackWidth, setTrackWidth] = useState(0);
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const inset = 3;
  const gap = 2;
  const segmentWidth = trackWidth > 0
    ? (trackWidth - inset * 2 - gap * (PERIOD_OPTIONS.length - 1)) / PERIOD_OPTIONS.length
    : 0;

  useEffect(() => {
    if (segmentWidth <= 0) {
      indicatorX.value = 0;
      indicatorWidth.value = 0;
      return;
    }

    const timing = {
      duration: motionDuration(motionDurations.tabs, reduceMotion),
      easing: motionEasings.tab
    };

    indicatorX.value = withTiming(selectedIndex * (segmentWidth + gap), timing);
    indicatorWidth.value = withTiming(segmentWidth, timing);
  }, [indicatorWidth, indicatorX, reduceMotion, segmentWidth, selectedIndex]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value
  }));

  function handleLayout(event: LayoutChangeEvent) {
    setTrackWidth(event.nativeEvent.layout.width);
  }

  return (
    <View onLayout={handleLayout} style={localStyles.periodSegment}>
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[localStyles.periodIndicator, indicatorStyle]}
        />
      ) : null}

      {PERIOD_OPTIONS.map((option) => {
        const active = option.value === period;
        return (
          <Pressable
            accessibilityLabel={`Show ${periodLabel(option.value)} dashboard`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              localStyles.periodOption,
              segmentWidth > 0 && { width: segmentWidth },
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
    maxWidth: 142,
    minWidth: 0,
    textAlign: 'center'
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
    gap: 8,
    minWidth: 0
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
    minWidth: 27,
    paddingHorizontal: 8,
    zIndex: 1
  },
  periodOptionPressed: {
    backgroundColor: 'rgba(255,253,247,0.12)'
  },
  periodIndicator: {
    backgroundColor: 'rgba(255,253,247,0.92)',
    borderRadius: 6,
    bottom: 3,
    left: 3,
    position: 'absolute',
    top: 3
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
