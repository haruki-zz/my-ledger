import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Animated as RNAnimated,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryDetailSheet } from '@/src/components/CategoryDetailSheet';
import { DashboardCategoryShare } from '@/src/components/DashboardCategoryShare';
import { motionCardResizeTransition } from '@/src/components/motion';
import { SlidingValueText } from '@/src/components/SlidingValueText';
import { colors, fontFamilies, styles } from '@/src/components/styles';
import { TransferSettleEntry } from '@/src/components/TransferSettleEntry';
import { BentoCard } from '@/src/components/ui';
import { ZenHome, type ZenHomeData } from '@/src/components/ZenHome';
import { useTabChrome } from '@/src/context/TabChromeContext';
import { useDashboardData } from '@/src/hooks/useDashboardData';
import { useTransferChecklist } from '@/src/hooks/useTransferChecklist';
import { categoryColor, categoryLabel } from '@/src/lib/categorySystem';
import { buildUserColorMap, colorForDarkSurface, DEFAULT_PARTNER_COLOR, DEFAULT_USER_COLOR } from '@/src/lib/entityColors';
import { DEFAULT_LEDGER_TIME_ZONE, displayName, formatCompactYen, formatYen, todayDateString } from '@/src/lib/format';
import { motionDuration, motionEasings, useReduceMotion } from '@/src/lib/motion';
import {
  addMonths,
  amountForUser,
  buildDashboardBudgetSummary,
  buildDashboardHeatDays,
  currentMonthKey,
  expenseCategoryId,
  isFixedExpense,
  isVariableExpense,
  monthEndDateString,
  monthKeyFromDateString,
  monthStartDateString,
  type CategoryStat,
  type DashboardPeriodStats,
  type HeatDay
} from '@/src/lib/stats';
import type { Expense } from '@/src/types/database';

const HERO_FLIP_DURATION_MS = 520;
const BUDGET_UNDER_COLOR = '#5FB8B2';
const BUDGET_WARNING_COLOR = '#C0892E';
const BUDGET_OVER_COLOR = '#C14B34';
const ZEN_TRANSITION_DURATION_MS = 300;
const USE_NATIVE_ANIMATION_DRIVER = Platform.OS !== 'web';
const HEAT_COLORS = [
  'rgba(42,39,34,0.05)',
  'rgba(192,137,46,0.20)',
  'rgba(192,137,46,0.42)',
  'rgba(176,122,30,0.70)',
  '#8A5A12'
] as const;

type BudgetSummary = {
  budgetYen: number;
  budgetedSpendYen: number;
  color: string;
  dailyAllowanceYen: number | null;
  daysRemaining: number;
  fixedYen: number;
  hasBudget: boolean;
  line: string;
  metaLine: string | null;
  paceRatio: number;
  remainingYen: number;
  unbudgetedVariableYen: number;
  usedPercent: number;
  usedRatio: number;
  variableYen: number;
};

type RecentExpenseItem = {
  amountYen: number;
  categoryColor: string;
  id: string;
  label: string;
  paidBy: string;
  relativeTime: string;
};

type RecentExpenseItemWithSort = RecentExpenseItem & {
  sortKey: string;
};

type CategoryMixSegment = {
  amountYen: number;
  color: string;
  label: string;
  percentage: number;
};

type SpendDay = {
  amountYen: number;
  budgetedAmountYen: number;
  categories: CategoryMixSegment[];
  date: string;
};

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { height: windowHeight } = useWindowDimensions();
  const { setChromeHidden } = useTabChrome();
  const currentDashboardMonthKey = currentMonthKey();
  const screenHeight = Math.max(1, windowHeight);
  const [periodOffset, setPeriodOffset] = useState(0);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [selectedActivityDate, setSelectedActivityDate] = useState<string | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [jumpSheetOpen, setJumpSheetOpen] = useState(false);
  const [zenHomeVisible, setZenHomeVisible] = useState(true);
  const [zenHomeTranslateY] = useState(() => new RNAnimated.Value(0));
  const heroFlipProgress = useSharedValue(0);
  const {
    ledger,
    members,
    currentUserId,
    otherUserId,
    settledExpenses,
    combinedStats,
    personalStats,
    stats,
    error,
    reload
  } = useDashboardData(currentDashboardMonthKey, 'month', periodOffset, flipped);
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
  const activeMonthKey = stats.dateRange.effectiveMonthKey;
  const activeMonthLabel = formatDashboardMonthTitle(activeMonthKey);
  const ledgerTodayString = todayDateString(DEFAULT_LEDGER_TIME_ZONE);
  const activityEndDateString = stats.dateRange.endDateString;
  const budgetSummary = useMemo(() => (
    buildBudgetSummary({
      monthKey: activeMonthKey,
      stats: personalStats,
      todayString: ledgerTodayString
    })
  ), [activeMonthKey, ledgerTodayString, personalStats]);
  const combinedMemberStats = combinedStats.memberTotals;
  const currentMemberStat = combinedMemberStats.find((member) => member.userId === currentUserId);
  const otherMemberStat = combinedMemberStats.find((member) => member.userId === otherUserId);
  const heatDays = useMemo(() => (
    buildDashboardHeatDays({
      expenses: settledExpenses,
      monthKey: activeMonthKey,
      members,
      currentUserId,
      today: ledgerTodayString,
      viewerUserId: flipped ? null : currentUserId
    })
  ), [activeMonthKey, currentUserId, flipped, ledgerTodayString, members, settledExpenses]);
  const trailingDays = useMemo(() => (
    buildTrailingSpendDays({
      budgetedCategoryIds: flipped ? [] : personalStats.budgetedCategoryIds,
      days: 7,
      endDateString: activityEndDateString,
      expenses: settledExpenses,
      viewerUserId: flipped ? null : currentUserId
    })
  ), [activityEndDateString, currentUserId, flipped, personalStats.budgetedCategoryIds, settledExpenses]);
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
  const jumpMonths = useMemo(() => (
    Array.from({ length: 8 }, (_, index) => {
      const offset = index - 7;
      const monthKey = addMonths(currentDashboardMonthKey, offset);
      return {
        label: formatJumpMonthLabel(monthKey),
        monthKey,
        offset
      };
    })
  ), [currentDashboardMonthKey]);
  const heroResize = motionCardResizeTransition(reduceMotion);
  const zenHomeData = useMemo(() => (
    buildZenHomeData({
      budget: budgetSummary,
      monthKey: activeMonthKey,
      budgetedTodayYen: trailingDays.find((day) => day.date === ledgerTodayString)?.budgetedAmountYen || 0
    })
  ), [activeMonthKey, budgetSummary, ledgerTodayString, trailingDays]);

  const closeCategoryDetail = useCallback(() => {
    setSelectedCategoryKey(null);
  }, []);

  const settleZenTransition = useCallback((visible: boolean) => {
    if (visible) {
      setZenHomeVisible(true);
    }

    zenHomeTranslateY.stopAnimation();
    RNAnimated.timing(zenHomeTranslateY, {
      duration: motionDuration(ZEN_TRANSITION_DURATION_MS, reduceMotion),
      easing: Easing.out(Easing.cubic),
      toValue: visible ? 0 : -screenHeight,
      useNativeDriver: USE_NATIVE_ANIMATION_DRIVER
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }

      setZenHomeVisible(visible);
      zenHomeTranslateY.setValue(visible ? 0 : -screenHeight);
    });
  }, [reduceMotion, screenHeight, zenHomeTranslateY]);

  const openDashboardFromZen = useCallback(() => {
    settleZenTransition(false);
  }, [settleZenTransition]);

  const openZenFromDashboard = useCallback(() => {
    settleZenTransition(true);
  }, [settleZenTransition]);

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

  useFocusEffect(useCallback(() => {
    setZenHomeVisible(true);
    zenHomeTranslateY.stopAnimation();
    zenHomeTranslateY.setValue(0);

    return () => {
      setSelectedCategoryKey(null);
    };
  }, [zenHomeTranslateY]));

  useEffect(() => {
    setChromeHidden(zenHomeVisible);

    return () => {
      setChromeHidden(false);
    };
  }, [setChromeHidden, zenHomeVisible]);

  const refreshDashboard = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await Promise.all([reload({ userInitiated: true }), reloadTransfers({ userInitiated: true })]);
    } finally {
      setManualRefreshing(false);
    }
  }, [reload, reloadTransfers]);

  function openJumpSheet() {
    setJumpSheetOpen(true);
  }

  function closeJumpSheet() {
    setJumpSheetOpen(false);
  }

  function jumpToday() {
    setSelectedCategoryKey(null);
    setSelectedActivityDate(null);
    setPeriodOffset(0);
    closeJumpSheet();
  }

  function jumpMonth(offset: number) {
    setSelectedCategoryKey(null);
    setSelectedActivityDate(null);
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

  function openZenAddEntry() {
    router.push('/expenses/new');
  }

  return (
    <>
      <View style={localStyles.dashboardShell}>
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
          {error ? <Text selectable style={styles.error}>{error}</Text> : null}

          <DashboardMonthTitle
            active={periodOffset === 0}
            label={activeMonthLabel}
            onOpen={openJumpSheet}
            onOpenZen={openZenFromDashboard}
            onReset={jumpToday}
          />

          <View style={localStyles.heroZone}>
            <Animated.View layout={heroResize}>
              <BentoCard variant="hero" style={localStyles.heroCard}>
                <View style={localStyles.heroHeader}>
                  <SectionLabel dark title={flipped ? 'Together Spend' : 'Budget'} />
                  <View style={localStyles.heroScopeDots}>
                    <View style={[localStyles.heroScopeDot, { backgroundColor: flipped ? currentUserColorOnDark : 'rgba(255,253,247,0.82)' }]} />
                    {flipped ? (
                      <View style={[localStyles.heroScopeDot, localStyles.heroScopeDotOverlap, { backgroundColor: otherUserColorOnDark }]} />
                    ) : null}
                  </View>
                </View>

                <HeroFlipZone
                  backFace={(
                    <HeroCombinedFace
                      currentUserColor={currentUserColorOnDark}
                      currentUserName={currentUserName}
                      currentUserTotalYen={currentMemberStat?.amountYen || 0}
                      otherUserColor={otherUserColorOnDark}
                      otherUserId={otherUserId}
                      otherUserName={otherUserName}
                      otherUserTotalYen={otherMemberStat?.amountYen || 0}
                      stats={combinedStats}
                    />
                  )}
                  canFlip={Boolean(otherUserId)}
                  frontFace={(
                    <HeroBudgetFace
                      budget={budgetSummary}
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
            <DashboardNowCard
              budget={budgetSummary}
              flipped={flipped}
              trailingDays={trailingDays}
            />
            <DashboardRecentCard
              combined={flipped}
              items={scopedRecentExpenses}
              userColorById={userColorById}
            />
          </View>

          <View style={localStyles.insightGrid}>
            <DashboardHeatMapCard
              days={heatDays}
              monthKey={activeMonthKey}
              todayString={ledgerTodayString}
            />
            <DashboardBudgetWatchCard
              categories={personalStats.categories}
              flipped={flipped}
            />
          </View>

          <DashboardFixedExpensesCard
            categories={stats.fixedCategories}
            totalYen={stats.fixedTotalYen}
          />

          <DashboardSevenDayActivity
            days={trailingDays}
            onOpenHistory={viewHistoryDate}
            onSelectDate={setSelectedActivityDate}
            selectedDate={selectedActivityDate}
          />

          <DashboardCategoryShare
            categories={stats.categories}
            colorAnimationDurationMs={HERO_FLIP_DURATION_MS}
            onCategoryPress={openCategoryDetail}
            selectedCategoryKey={selectedCategoryKey}
            showBudgets={!flipped}
            totalYen={stats.variableTotalYen}
          />

          </View>
        </ScrollView>
      </View>

      <CategoryDetailSheet
        detail={selectedCategoryDetail}
        members={members}
        onClose={closeCategoryDetail}
      />
      <JumpToSheet
        activeMonthOffset={periodOffset}
        months={jumpMonths}
        onClose={closeJumpSheet}
        onJumpMonth={jumpMonth}
        onToday={jumpToday}
        visible={jumpSheetOpen}
      />
      <ZenHome
        data={zenHomeData}
        interactionEnabled={zenHomeVisible}
        onOpenDashboard={openDashboardFromZen}
        onOpenAddEntry={openZenAddEntry}
        translateY={zenHomeTranslateY}
      />
    </>
  );
}

function DashboardMonthTitle({
  active,
  label,
  onOpen,
  onOpenZen,
  onReset
}: {
  active: boolean;
  label: string;
  onOpen: () => void;
  onOpenZen: () => void;
  onReset: () => void;
}) {
  return (
    <View style={localStyles.monthTitleRow}>
      <View style={localStyles.monthTitleLeft}>
        <Pressable
          accessibilityHint="Opens the Jump to month sheet"
          accessibilityLabel={`Jump from ${label}`}
          accessibilityRole="button"
          onPress={onOpen}
          style={({ pressed }) => [localStyles.monthTitleButton, pressed && localStyles.monthTitleButtonPressed]}
        >
          <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.monthTitle}>{label}</Text>
          <Ionicons color="rgba(42,39,34,0.38)" name="chevron-down" size={13} />
        </Pressable>
        {!active ? (
          <Pressable
            accessibilityLabel="Return to current month"
            accessibilityRole="button"
            onPress={onReset}
            style={({ pressed }) => [localStyles.monthResetDot, pressed && localStyles.monthResetDotPressed]}
          />
        ) : null}
      </View>
      <Pressable
        accessibilityLabel="Open zen mode"
        accessibilityRole="button"
        onPress={onOpenZen}
        style={({ pressed }) => [localStyles.zenModeButton, pressed && localStyles.zenModeButtonPressed]}
      >
        <Text style={localStyles.zenModeButtonText}>ZEN</Text>
      </Pressable>
    </View>
  );
}

function HeroBudgetFace({
  budget
}: {
  budget: BudgetSummary;
}) {
  return (
    <View style={localStyles.heroBudgetFace}>
      <BudgetRing budget={budget} />
      <View style={localStyles.heroBudgetCopy}>
        <Text style={localStyles.heroMetricLabel}>BUDGETED SPEND</Text>
        <SlidingValueText
          formatValue={formatYen}
          textStyle={localStyles.heroAmount}
          value={budget.budgetedSpendYen}
          wrapperStyle={localStyles.heroAmountSlot}
        />
        <Text
          adjustsFontSizeToFit
          numberOfLines={1}
          style={[localStyles.heroBudgetLine, { color: budget.hasBudget ? budget.color : 'rgba(255,253,247,0.70)' }]}
        >
          {budget.line}
        </Text>
        {budget.metaLine ? (
          <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.heroBudgetMeta}>
            {budget.metaLine}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function BudgetRing({ budget }: { budget: BudgetSummary }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const used = budget.hasBudget ? Math.min(1, Math.max(0, budget.usedRatio)) : 0;
  const arcLength = circumference * used;
  const paceAngle = -90 + budget.paceRatio * 360;
  const paceRadians = (paceAngle * Math.PI) / 180;
  const paceX = 50 + radius * Math.cos(paceRadians);
  const paceY = 50 + radius * Math.sin(paceRadians);

  return (
    <View style={localStyles.budgetRing}>
      <Svg height={104} viewBox="0 0 100 100" width={104}>
        <Circle
          cx={50}
          cy={50}
          fill="none"
          r={radius}
          stroke="rgba(255,253,247,0.12)"
          strokeWidth={9}
        />
        {budget.hasBudget ? (
          <>
            <Circle
              cx={50}
              cy={50}
              fill="none"
              r={radius}
              rotation={-90}
              origin="50, 50"
              stroke={budget.color}
              strokeDasharray={`${arcLength} ${circumference - arcLength}`}
              strokeLinecap="round"
              strokeWidth={9}
            />
            <Circle
              cx={paceX}
              cy={paceY}
              fill="#FFFDF7"
              r={3.4}
              stroke="#3A322A"
              strokeWidth={1.3}
            />
          </>
        ) : null}
      </Svg>
      <View style={localStyles.budgetRingLabel}>
        <Text style={localStyles.budgetRingPercent}>{budget.hasBudget ? `${Math.round(budget.usedPercent)}%` : '--'}</Text>
        <Text style={localStyles.budgetRingCaption}>{budget.hasBudget ? 'of budget' : 'no budget'}</Text>
      </View>
    </View>
  );
}

function HeroCombinedFace({
  currentUserColor,
  currentUserName,
  currentUserTotalYen,
  otherUserColor,
  otherUserId,
  otherUserName,
  otherUserTotalYen,
  stats
}: {
  currentUserColor: string;
  currentUserName: string;
  currentUserTotalYen: number;
  otherUserColor: string;
  otherUserId: string | null;
  otherUserName: string;
  otherUserTotalYen: number;
  stats: DashboardPeriodStats;
}) {
  return (
    <View style={localStyles.heroCombinedFace}>
      <SlidingValueText
        formatValue={formatYen}
        textStyle={localStyles.heroAmount}
        value={stats.totalYen}
        wrapperStyle={localStyles.heroAmountSlot}
      />
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
    const fallbackHeight = frontFaceHeight || backFaceHeight || 116;
    const stableHeight = Math.max(frontFaceHeight, backFaceHeight);
    return {
      height: canFlip && hasMeasuredFaces
        ? stableHeight
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
        accessibilityHint="Flips between your budget view and combined spending with your partner"
        accessibilityLabel={flipped ? 'Show your budget view' : `Show combined spending with ${otherUserName}`}
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

function DashboardNowCard({
  budget,
  flipped,
  trailingDays
}: {
  budget: BudgetSummary;
  flipped: boolean;
  trailingDays: SpendDay[];
}) {
  const today = trailingDays[trailingDays.length - 1] || null;
  const weekAmount = trailingDays.reduce((sum, day) => sum + day.amountYen, 0);
  const weekMix = mergeCategoryMix(trailingDays.flatMap((day) => day.categories));
  const todayRatio = !flipped && budget.dailyAllowanceYen && budget.dailyAllowanceYen > 0
    ? today?.budgetedAmountYen ? today.budgetedAmountYen / budget.dailyAllowanceYen : 0
    : null;
  const ratioTone = todayRatio === null
    ? colors.subtle
    : todayRatio > 1.3
      ? BUDGET_OVER_COLOR
      : todayRatio > 0.9
        ? BUDGET_WARNING_COLOR
        : BUDGET_UNDER_COLOR;

  return (
    <BentoCard style={localStyles.insightCard}>
      <CardHeader right="MIX" title="NOW" />
      <View style={localStyles.nowMetric}>
        <View style={localStyles.nowMetricLine}>
          <Text style={localStyles.nowMetricLabel}>Today</Text>
          <SlidingValueText
            fitToWidth
            formatValue={formatYen}
            textStyle={localStyles.nowMetricAmount}
            value={today?.amountYen || 0}
            wrapperStyle={localStyles.nowMetricAmountSlot}
          />
        </View>
        <ActualMixCapsules segments={today?.categories || []} />
      </View>
      <View style={localStyles.nowMetric}>
        <View style={localStyles.nowMetricLine}>
          <Text style={localStyles.nowMetricLabel}>Week</Text>
          <SlidingValueText
            fitToWidth
            formatValue={formatYen}
            textStyle={localStyles.nowMetricAmount}
            value={weekAmount}
            wrapperStyle={localStyles.nowMetricAmountSlot}
          />
        </View>
        <ActualMixCapsules segments={weekMix} />
      </View>
      <Text numberOfLines={2} style={[localStyles.nowCaption, { color: ratioTone }]}>
        {todayRatio === null ? 'bars show daily category share' : `budgeted today is ${todayRatio.toFixed(1)}x daily allowance`}
      </Text>
    </BentoCard>
  );
}

function DashboardRecentCard({
  combined,
  items,
  userColorById
}: {
  combined: boolean;
  items: RecentExpenseItem[];
  userColorById: Map<string, string>;
}) {
  return (
    <BentoCard style={localStyles.insightCard}>
      <CardHeader right="LAST 3" title="RECENT" />
      <View style={localStyles.recentList}>
        {items.length > 0 ? items.map((item) => {
          const dotColor = combined
            ? userColorById.get(item.paidBy) || DEFAULT_PARTNER_COLOR
            : item.categoryColor;
          return (
            <View key={item.id} style={localStyles.recentRow}>
              <View style={[localStyles.recentDot, { backgroundColor: dotColor }]} />
              <View style={localStyles.recentTextBlock}>
                <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.recentName}>
                  {item.label}
                </Text>
                <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.recentTime}>
                  {item.relativeTime}
                </Text>
              </View>
              <SlidingValueText
                fitToWidth
                formatValue={formatCompactYen}
                textStyle={localStyles.recentAmount}
                value={item.amountYen}
                wrapperStyle={localStyles.recentAmountSlot}
              />
            </View>
          );
        }) : (
          <View style={localStyles.emptyInsight}>
            <Text style={localStyles.emptyInsightTitle}>No recent records</Text>
            <Text style={localStyles.emptyInsightText}>New expenses will appear here.</Text>
          </View>
        )}
      </View>
    </BentoCard>
  );
}

function DashboardHeatMapCard({
  days,
  monthKey,
  todayString
}: {
  days: HeatDay[];
  monthKey: string;
  todayString: string;
}) {
  const rows = useMemo(() => buildHeatMapRows(days, monthKey, todayString), [days, monthKey, todayString]);

  return (
    <BentoCard style={localStyles.insightCard}>
      <CardHeader title="HEAT MAP" />
      <View style={localStyles.heatWeekdayRow}>
        {['Sun', '', 'Tue', '', 'Thu', '', 'Sat'].map((label, index) => (
          <Text key={`${label}-${index}`} style={localStyles.heatWeekday}>{label}</Text>
        ))}
      </View>
      <View style={localStyles.heatGrid}>
        {rows.map((row, rowIndex) => (
          <View key={`heat-row-${rowIndex}`} style={localStyles.heatGridRow}>
            {row.map((cell, columnIndex) => (
              <View
                key={`heat-cell-${rowIndex}-${columnIndex}`}
                style={[
                  localStyles.heatCell,
                  {
                    backgroundColor: cell.color,
                    borderColor: cell.today ? colors.primary : 'transparent',
                    opacity: cell.empty ? 0 : 1
                  }
                ]}
              />
            ))}
          </View>
        ))}
      </View>
    </BentoCard>
  );
}

function DashboardBudgetWatchCard({
  categories,
  flipped
}: {
  categories: CategoryStat[];
  flipped: boolean;
}) {
  const budgetRows = useMemo(() => (
    categories
      .filter((category) => category.hasBudget && (category.budgetYen || 0) > 0)
      .map((category) => {
        const ratio = (category.budgetUsedPercent || 0) / 100;
        return {
          category,
          color: budgetColorForRatio(ratio),
          ratio
        };
      })
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 3)
  ), [categories]);
  const overCount = categories.filter((category) => category.budgetStatus === 'over').length;

  return (
    <BentoCard style={localStyles.insightCard}>
      <CardHeader right={flipped ? '' : overCount > 0 ? `${overCount} OVER` : 'ON TRACK'} title="TREND" />
      {flipped ? (
        <View style={localStyles.quietState}>
          <Ionicons color={colors.subtle} name="lock-closed-outline" size={17} />
          <Text style={localStyles.quietStateText}>Budgets are personal</Text>
        </View>
      ) : budgetRows.length > 0 ? (
        <View style={localStyles.budgetWatchList}>
          {budgetRows.map(({ category, color, ratio }) => (
            <View key={category.detailKey} style={localStyles.budgetWatchRow}>
              <View style={localStyles.budgetWatchLine}>
                <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.budgetWatchName}>
                  {category.category}
                </Text>
                <SlidingValueText
                  formatValue={formatRoundedPercent}
                  textStyle={[localStyles.budgetWatchPercent, { color }]}
                  value={ratio * 100}
                  wrapperStyle={localStyles.budgetWatchPercentSlot}
                />
              </View>
              <BudgetOverflowBar color={color} ratio={ratio} />
            </View>
          ))}
        </View>
      ) : (
        <View style={localStyles.quietState}>
          <Ionicons color={colors.subtle} name="wallet-outline" size={17} />
          <Text style={localStyles.quietStateText}>No category budgets</Text>
        </View>
      )}
    </BentoCard>
  );
}

function DashboardFixedExpensesCard({
  categories,
  totalYen
}: {
  categories: CategoryStat[];
  totalYen: number;
}) {
  const visibleCategories = categories
    .filter((category) => category.amountYen > 0)
    .slice(0, 3);

  if (totalYen <= 0) {
    return null;
  }

  return (
    <BentoCard style={localStyles.fixedSpendCard}>
      <View style={localStyles.fixedSpendHeader}>
        <CardHeader right="SEPARATE" title="FIXED" />
        <SlidingValueText
          fitToWidth
          formatValue={formatYen}
          textStyle={localStyles.fixedSpendTotal}
          value={totalYen}
          wrapperStyle={localStyles.fixedSpendTotalSlot}
        />
      </View>
      <View style={localStyles.fixedSpendRows}>
        {visibleCategories.map((category) => (
          <View key={category.detailKey} style={localStyles.fixedSpendRow}>
            <View style={[localStyles.fixedSpendDot, { backgroundColor: category.color }]} />
            <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.fixedSpendName}>
              {category.category}
            </Text>
            <Text style={localStyles.fixedSpendAmount}>{formatYen(category.amountYen)}</Text>
          </View>
        ))}
      </View>
    </BentoCard>
  );
}

function DashboardSevenDayActivity({
  days,
  onOpenHistory,
  onSelectDate,
  selectedDate
}: {
  days: SpendDay[];
  onOpenHistory: (date: string) => void;
  onSelectDate: (date: string | null) => void;
  selectedDate: string | null;
}) {
  const average = days.length > 0
    ? days.reduce((sum, day) => sum + day.amountYen, 0) / days.length
    : 0;
  const activityScale = resolveActivityScale(days.map((day) => day.amountYen));
  const peakDay = days.reduce<SpendDay | null>((peak, day) => (
    !peak || day.amountYen > peak.amountYen ? day : peak
  ), null);
  const selectedDay = days.find((day) => day.date === selectedDate) || null;

  return (
    <BentoCard style={localStyles.activityCard}>
      <CardHeader right={peakDay ? `PEAK ${formatMonthDay(peakDay.date).toUpperCase()}` : ''} title="DAILY ACTIVITY" />
      <View style={localStyles.activityBars}>
        {days.map((day) => {
          const selected = selectedDate === day.date;
          const barHeight = resolveActivityBarHeight(day.amountYen, activityScale);
          const ratio = average > 0 ? day.amountYen / average : 0;
          const barColor = activityColorForRatio(ratio);
          return (
            <Pressable
              accessibilityLabel={`${formatFullDay(day.date)} ${formatYen(day.amountYen)}`}
              accessibilityRole="button"
              key={day.date}
              onPress={() => onSelectDate(selected ? null : day.date)}
              style={({ pressed }) => [
                localStyles.activityColumn,
                selected && localStyles.activityColumnSelected,
                pressed && localStyles.activityColumnPressed
              ]}
            >
              <View style={localStyles.activityBarSlot}>
                <View
                  style={[
                    localStyles.activityBar,
                    {
                      backgroundColor: barColor,
                      height: barHeight
                    }
                  ]}
                />
              </View>
              <Text style={[localStyles.activityDate, selected && localStyles.activityDateSelected]}>
                {formatMonthDay(day.date)}
              </Text>
              <SlidingValueText
                fitToWidth
                formatValue={formatCompactYenWithoutCurrency}
                textStyle={localStyles.activityAmount}
                value={day.amountYen}
                wrapperStyle={localStyles.activityAmountSlot}
              />
            </Pressable>
          );
        })}
      </View>
      {selectedDay ? (
        <View style={localStyles.dayBreakdown}>
          <View style={localStyles.dayBreakdownHeader}>
            <View>
              <Text style={localStyles.dayBreakdownDate}>{formatFullDay(selectedDay.date)}</Text>
              <Text style={localStyles.dayBreakdownTotal}>{formatYen(selectedDay.amountYen)} total</Text>
            </View>
            <Pressable
              accessibilityLabel={`Open history for ${formatFullDay(selectedDay.date)}`}
              accessibilityRole="button"
              onPress={() => onOpenHistory(selectedDay.date)}
              style={({ pressed }) => [localStyles.historyButton, pressed && localStyles.historyButtonPressed]}
            >
              <Ionicons color={colors.primary} name="arrow-forward" size={15} />
            </Pressable>
          </View>
          <View style={localStyles.dayBreakdownRows}>
            {selectedDay.categories.slice(0, 2).map((category) => (
              <View key={category.label} style={localStyles.dayBreakdownRow}>
                <View style={[localStyles.dayBreakdownDot, { backgroundColor: category.color }]} />
                <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.dayBreakdownName}>
                  {category.label}
                </Text>
                <Text style={localStyles.dayBreakdownAmount}>{formatYen(category.amountYen)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </BentoCard>
  );
}

function CardHeader({
  right,
  title
}: {
  right?: string;
  title: string;
}) {
  return (
    <View style={localStyles.cardHeader}>
      <SectionLabel title={title} />
      {right ? (
        <Text numberOfLines={1} style={localStyles.cardHeaderRight}>
          {right}
        </Text>
      ) : null}
    </View>
  );
}

function SectionLabel({ dark = false, title }: { dark?: boolean; title: string }) {
  return (
    <View style={localStyles.sectionLabel}>
      <View style={localStyles.insightTick} />
      <Text style={[localStyles.insightTitle, dark && localStyles.insightTitleDark]}>{title}</Text>
    </View>
  );
}

function ActualMixCapsules({ segments }: { segments: CategoryMixSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.amountYen, 0);
  const visibleSegments = total > 0 ? segments.filter((segment) => segment.amountYen > 0).slice(0, 5) : [];
  const slots = buildMixCapsuleSlots(visibleSegments, 20);

  return (
    <View style={localStyles.actualMixCapsuleGrid}>
      {slots.length > 0 ? slots.map((color, index) => (
        <View
          key={`mix-cap-${index}-${color}`}
          style={[
            localStyles.actualMixCapsule,
            { backgroundColor: color }
          ]}
        />
      )) : (
        Array.from({ length: 20 }, (_, index) => (
          <View key={`mix-empty-${index}`} style={[localStyles.actualMixCapsule, localStyles.actualMixEmpty]} />
        ))
      )}
    </View>
  );
}

function BudgetOverflowBar({
  color,
  ratio
}: {
  color: string;
  ratio: number;
}) {
  const boundedRatio = Math.max(0, ratio);
  const budgetWidth = `${Math.min(1, boundedRatio) * 100}%` as `${number}%`;
  const overflowWidth = `${Math.min(1, Math.max(0, boundedRatio - 1) / 0.5) * 100}%` as `${number}%`;

  return (
    <View style={localStyles.budgetOverflowTrack}>
      <View style={localStyles.budgetOverflowBudgetZone}>
        <View style={[localStyles.budgetOverflowFill, { backgroundColor: color, width: budgetWidth }]} />
      </View>
      <View style={localStyles.budgetOverflowMarker} />
      <View style={localStyles.budgetOverflowZone}>
        {boundedRatio > 1 ? (
          <View style={[localStyles.budgetOverflowFill, { backgroundColor: BUDGET_OVER_COLOR, width: overflowWidth }]} />
        ) : null}
      </View>
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

function JumpToSheet({
  activeMonthOffset,
  months,
  onClose,
  onJumpMonth,
  onToday,
  visible
}: {
  activeMonthOffset: number;
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
          accessibilityLabel="Jump to month"
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={localStyles.jumpSheet}
        >
          <View style={localStyles.jumpHandleHitArea} {...sheetPanResponder.panHandlers}>
            <View style={localStyles.jumpHandle} />
          </View>
          <View style={localStyles.jumpHeader}>
            <Text style={localStyles.jumpTitle}>Jump to month</Text>
            <Pressable
              accessibilityLabel="Close jump to month"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [localStyles.jumpCloseButton, pressed && localStyles.jumpPressed]}
            >
              <Ionicons color={colors.muted} name="close" size={18} />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onToday}
            style={({ pressed }) => [localStyles.jumpTodayButton, pressed && localStyles.jumpPressed]}
          >
            <Ionicons color="#3A322A" name="today-outline" size={18} />
            <Text style={localStyles.jumpTodayText}>Current month</Text>
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

function buildBudgetSummary(input: {
  monthKey: string;
  stats: DashboardPeriodStats;
  todayString: string;
}): BudgetSummary {
  const summary = buildDashboardBudgetSummary(input);
  const color = budgetColorForRatio(summary.usedRatio);
  const line = summary.budgetYen <= 0
    ? 'Set category budgets to unlock pace'
    : summary.remainingYen < 0
      ? `${formatYen(Math.abs(summary.remainingYen))} over budget`
      : `${formatYen(summary.dailyAllowanceYen || 0)} left / day`;
  const metaLine = summary.unbudgetedVariableYen > 0
    ? `${formatYen(summary.unbudgetedVariableYen)} unbudgeted daily spend`
    : null;

  return {
    budgetYen: summary.budgetYen,
    budgetedSpendYen: summary.budgetedSpendYen,
    color,
    dailyAllowanceYen: summary.dailyAllowanceYen,
    daysRemaining: summary.daysRemaining,
    fixedYen: summary.fixedYen,
    hasBudget: summary.hasBudget,
    line,
    metaLine,
    paceRatio: summary.paceRatio,
    remainingYen: summary.remainingYen,
    unbudgetedVariableYen: summary.unbudgetedVariableYen,
    usedPercent: summary.usedPercent,
    usedRatio: summary.usedRatio,
    variableYen: summary.variableYen
  };
}

function buildRecentExpenses(input: {
  expenses: Expense[];
  todayString: string;
  viewerUserId: string | null;
}): RecentExpenseItem[] {
  const items: RecentExpenseItemWithSort[] = [];
  for (const expense of input.expenses) {
    if (isFixedExpense(expense)) {
      continue;
    }

    const amountYen = input.viewerUserId ? amountForUser(expense, input.viewerUserId) : expense.amount_yen;
    if (amountYen <= 0) {
      continue;
    }

    const categoryId = expenseCategoryId(expense);
    items.push({
      amountYen,
      categoryColor: categoryColor(categoryId),
      id: expense.id,
      label: expense.subcategory || categoryLabel(categoryId),
      paidBy: expense.paid_by,
      relativeTime: formatRelativeExpenseDate(expense.spent_on, input.todayString),
      sortKey: `${expense.spent_on}T${expense.created_at || expense.updated_at || ''}`
    });
  }

  return items
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    .slice(0, 3)
    .map(({ sortKey, ...item }) => item);
}

function buildTrailingSpendDays(input: {
  budgetedCategoryIds?: string[];
  days: number;
  endDateString: string;
  expenses: Expense[];
  viewerUserId: string | null;
}): SpendDay[] {
  const dateStrings = Array.from({ length: input.days }, (_, index) => (
    addDaysToDateString(input.endDateString, index - input.days + 1)
  ));
  const dateSet = new Set(dateStrings);
  const budgetedCategoryIds = new Set(input.budgetedCategoryIds || []);
  const amountByDate = new Map<string, number>();
  const budgetedAmountByDate = new Map<string, number>();
  const categoryAmountsByDate = new Map<string, Map<string, { amountYen: number; color: string; label: string }>>();

  for (const date of dateStrings) {
    amountByDate.set(date, 0);
    budgetedAmountByDate.set(date, 0);
    categoryAmountsByDate.set(date, new Map());
  }

  for (const expense of input.expenses) {
    if (!isVariableExpense(expense)) {
      continue;
    }

    if (!dateSet.has(expense.spent_on)) {
      continue;
    }

    const amountYen = input.viewerUserId ? amountForUser(expense, input.viewerUserId) : expense.amount_yen;
    if (amountYen <= 0) {
      continue;
    }

    const categoryId = expenseCategoryId(expense);
    const categoryMap = categoryAmountsByDate.get(expense.spent_on);
    if (!categoryMap) {
      continue;
    }
    const current = categoryMap.get(categoryId) || {
      amountYen: 0,
      color: categoryColor(categoryId),
      label: categoryLabel(categoryId)
    };
    current.amountYen += amountYen;
    categoryMap.set(categoryId, current);
    amountByDate.set(expense.spent_on, (amountByDate.get(expense.spent_on) || 0) + amountYen);
    if (budgetedCategoryIds.has(categoryId)) {
      budgetedAmountByDate.set(expense.spent_on, (budgetedAmountByDate.get(expense.spent_on) || 0) + amountYen);
    }
  }

  return dateStrings.map((date) => {
    const categories = [...(categoryAmountsByDate.get(date)?.values() || [])]
      .sort((a, b) => b.amountYen - a.amountYen)
      .map((category) => ({
        ...category,
        percentage: amountByDate.get(date) ? (category.amountYen / (amountByDate.get(date) || 1)) * 100 : 0
      }));
    return {
      amountYen: amountByDate.get(date) || 0,
      budgetedAmountYen: budgetedAmountByDate.get(date) || 0,
      categories,
      date
    };
  });
}

function buildHeatMapRows(days: HeatDay[], monthKey: string, todayString: string) {
  const daysInMonth = Number(monthEndDateString(monthKey).slice(8, 10));
  const leadingEmptyCount = sundayFirstColumn(monthKey);
  const dayByDate = new Map(days.map((day) => [day.date, day]));
  const visibleAmounts = days.filter((day) => !isFutureDay(day.date, monthKey, todayString)).map((day) => day.amount);
  const maxAmount = Math.max(0, ...visibleAmounts);
  const cells: { color: string; empty: boolean; today: boolean }[] = [
    ...Array.from({ length: leadingEmptyCount }, () => ({
      color: 'transparent',
      empty: true,
      today: false
    }))
  ];

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const date = `${monthKey}-${String(dayNumber).padStart(2, '0')}`;
    const future = isFutureDay(date, monthKey, todayString);
    const amount = dayByDate.get(date)?.amount || 0;
    const ratio = maxAmount > 0 ? amount / maxAmount : 0;
    const level = amount <= 0
      ? 0
      : ratio < 0.22
        ? 1
        : ratio < 0.45
          ? 2
          : ratio < 0.72
            ? 3
            : 4;
    cells.push({
      color: future ? 'rgba(42,39,34,0.045)' : HEAT_COLORS[level],
      empty: false,
      today: date === todayString
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      color: 'transparent',
      empty: true,
      today: false
    });
  }

  const rows: { color: string; empty: boolean; today: boolean }[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    rows.push(cells.slice(index, index + 7));
  }
  return rows;
}

function mergeCategoryMix(categories: CategoryMixSegment[]) {
  const byLabel = new Map<string, CategoryMixSegment>();
  for (const category of categories) {
    const current = byLabel.get(category.label) || {
      amountYen: 0,
      color: category.color,
      label: category.label,
      percentage: 0
    };
    current.amountYen += category.amountYen;
    byLabel.set(category.label, current);
  }
  const total = [...byLabel.values()].reduce((sum, category) => sum + category.amountYen, 0);
  return [...byLabel.values()]
    .sort((a, b) => b.amountYen - a.amountYen)
    .map((category) => ({
      ...category,
      percentage: total > 0 ? (category.amountYen / total) * 100 : 0
    }));
}

function buildMixCapsuleSlots(segments: CategoryMixSegment[], slots: number) {
  if (segments.length === 0) {
    return [];
  }

  const counts = largestRemainder(
    segments.map((segment) => segment.amountYen),
    slots
  );
  const colorsOut: string[] = [];
  segments.forEach((segment, index) => {
    for (let slot = 0; slot < counts[index]; slot += 1) {
      colorsOut.push(segment.color);
    }
  });
  return colorsOut.slice(0, slots);
}

function largestRemainder(weights: number[], slots: number) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return weights.map(() => 0);
  }

  const exact = weights.map((weight) => (weight / total) * slots);
  const counts = exact.map(Math.floor);
  let used = counts.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - counts[index] }))
    .sort((a, b) => b.remainder - a.remainder);
  let orderIndex = 0;

  while (used < slots && order.length > 0) {
    counts[order[orderIndex % order.length].index] += 1;
    used += 1;
    orderIndex += 1;
  }

  return counts;
}

function resolveActivityScale(amounts: number[]) {
  const nonZeroAmounts = amounts.filter((amount) => amount > 0).sort((a, b) => a - b);
  if (nonZeroAmounts.length === 0) {
    return {
      maxAmount: 1,
      unit: 1
    };
  }

  const maxAmount = nonZeroAmounts[nonZeroAmounts.length - 1];
  const median = quantile(nonZeroAmounts, 0.5);
  return {
    maxAmount,
    unit: Math.max(500, Math.min(median || maxAmount, maxAmount / 12))
  };
}

function resolveActivityBarHeight(amount: number, scale: { maxAmount: number; unit: number }) {
  if (amount <= 0) {
    return 4;
  }

  const denominator = Math.log1p(scale.maxAmount / scale.unit);
  const ratio = denominator > 0
    ? Math.log1p(amount / scale.unit) / denominator
    : 1;
  return Math.max(8, Math.round(Math.min(1, ratio) * 76));
}

function quantile(sortedValues: number[], q: number) {
  if (sortedValues.length === 0) {
    return 0;
  }

  const position = (sortedValues.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sortedValues[base + 1];
  return next === undefined
    ? sortedValues[base]
    : sortedValues[base] + rest * (next - sortedValues[base]);
}

function budgetColorForRatio(ratio: number) {
  if (ratio < 0.6) {
    return BUDGET_UNDER_COLOR;
  }

  if (ratio < 0.9) {
    return BUDGET_WARNING_COLOR;
  }

  return BUDGET_OVER_COLOR;
}

function activityColorForRatio(ratio: number) {
  if (ratio > 1.6) {
    return BUDGET_OVER_COLOR;
  }

  if (ratio > 1.15) {
    return '#CC7A2E';
  }

  if (ratio < 0.5) {
    return 'rgba(192,137,46,0.35)';
  }

  return BUDGET_WARNING_COLOR;
}

function isFutureDay(date: string, monthKey: string, todayString: string) {
  const todayMonthKey = todayString.slice(0, 7);
  return monthKey === todayMonthKey && date > todayString;
}

function sundayFirstColumn(monthKey: string) {
  return parseDateString(`${monthKey}-01`).getDay();
}

function addDaysToDateString(dateString: string, amount: number) {
  const date = parseDateString(dateString);
  date.setDate(date.getDate() + amount);
  return toDateString(date);
}

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

function formatCompactYenWithoutCurrency(value: number) {
  return formatCompactYen(value).replace('¥', '');
}

function formatRoundedPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatFullDay(dateString: string) {
  return new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', weekday: 'short' }).format(parseDateString(dateString));
}

function formatMonthDay(dateString: string) {
  return new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short' }).format(parseDateString(dateString));
}

function formatDashboardMonthTitle(monthKey: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(parseDateString(monthStartDateString(monthKey)));
}

function formatJumpMonthLabel(monthKey: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(parseDateString(monthStartDateString(monthKey)));
}

function buildZenHomeData(input: {
  budget: BudgetSummary;
  budgetedTodayYen: number;
  monthKey: string;
}): ZenHomeData {
  return {
    budgetedMonthYen: input.budget.budgetedSpendYen,
    budgetedTodayYen: input.budgetedTodayYen,
    budgetRemainingYen: input.budget.remainingYen,
    budgetUsedPercent: input.budget.usedPercent,
    budgetYen: input.budget.budgetYen,
    daysRemaining: input.budget.daysRemaining,
    hasBudget: input.budget.hasBudget,
    leftPerDayYen: input.budget.dailyAllowanceYen || 0,
    monthLabel: formatDashboardMonthTitle(input.monthKey).toUpperCase(),
    unbudgetedVariableYen: input.budget.unbudgetedVariableYen
  };
}

const localStyles = StyleSheet.create({
  activityAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 9.5,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center'
  },
  activityAmountSlot: {
    alignItems: 'center',
    height: 12,
    width: 42
  },
  activityBar: {
    borderRadius: 8,
    width: 26
  },
  activityBars: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'space-between'
  },
  activityBarSlot: {
    alignItems: 'center',
    height: 78,
    justifyContent: 'flex-end',
    width: 32
  },
  activityCard: {
    borderRadius: 20,
    gap: 12,
    padding: 14
  },
  activityColumn: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    gap: 5,
    minHeight: 122,
    minWidth: 0,
    paddingHorizontal: 3,
    paddingVertical: 6
  },
  activityColumnPressed: {
    opacity: 0.76
  },
  activityColumnSelected: {
    backgroundColor: 'rgba(42,39,34,0.06)'
  },
  activityDate: {
    color: colors.subtle,
    fontFamily: fontFamilies.mono,
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center'
  },
  activityDateSelected: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontWeight: '700'
  },
  actualMixCapsule: {
    borderRadius: 999,
    height: 18,
    width: 4
  },
  actualMixCapsuleGrid: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 2.5,
    height: 22,
    justifyContent: 'space-between'
  },
  actualMixEmpty: {
    borderRadius: 999,
    backgroundColor: 'rgba(42,39,34,0.06)'
  },
  budgetOverflowBudgetZone: {
    backgroundColor: 'rgba(42,39,34,0.07)',
    borderBottomLeftRadius: 999,
    borderTopLeftRadius: 999,
    flex: 1,
    overflow: 'hidden'
  },
  budgetOverflowFill: {
    borderRadius: 999,
    height: '100%'
  },
  budgetOverflowMarker: {
    backgroundColor: 'rgba(42,39,34,0.34)',
    width: 2
  },
  budgetOverflowTrack: {
    flexDirection: 'row',
    height: 5,
    overflow: 'hidden'
  },
  budgetOverflowZone: {
    backgroundColor: 'rgba(193,75,52,0.14)',
    borderBottomRightRadius: 999,
    borderTopRightRadius: 999,
    overflow: 'hidden',
    width: 34
  },
  budgetRing: {
    alignItems: 'center',
    height: 104,
    justifyContent: 'center',
    width: 104
  },
  budgetRingCaption: {
    color: 'rgba(255,253,247,0.54)',
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center'
  },
  budgetRingLabel: {
    alignItems: 'center',
    gap: 1,
    position: 'absolute'
  },
  budgetRingPercent: {
    color: '#FFFDF7',
    fontFamily: fontFamilies.monoBold,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24
  },
  budgetWatchLine: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  budgetWatchList: {
    gap: 8
  },
  budgetWatchName: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    minWidth: 0
  },
  budgetWatchPercent: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'right'
  },
  budgetWatchPercentSlot: {
    alignItems: 'flex-end',
    height: 15,
    minWidth: 44
  },
  budgetWatchRow: {
    gap: 4
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 18
  },
  cardHeaderRight: {
    color: colors.muted,
    flexShrink: 0,
    fontFamily: fontFamilies.monoBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    lineHeight: 14,
    maxWidth: 92,
    textAlign: 'right'
  },
  content: {
    gap: 0
  },
  dashboardContent: {
    gap: 12
  },
  dashboardShell: {
    flex: 1
  },
  dayBreakdown: {
    backgroundColor: 'rgba(42,39,34,0.04)',
    borderRadius: 14,
    gap: 10,
    padding: 12
  },
  dayBreakdownAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'right'
  },
  dayBreakdownDate: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17
  },
  dayBreakdownDot: {
    borderRadius: 4,
    height: 8,
    width: 8
  },
  dayBreakdownHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  dayBreakdownName: {
    color: colors.muted,
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    minWidth: 0
  },
  dayBreakdownRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  dayBreakdownRows: {
    gap: 7
  },
  dayBreakdownTotal: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 14
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
  fixedSpendAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16
  },
  fixedSpendCard: {
    borderRadius: 16,
    gap: 10,
    padding: 12
  },
  fixedSpendDot: {
    borderRadius: 999,
    height: 8,
    width: 8
  },
  fixedSpendHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  fixedSpendName: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    minWidth: 0
  },
  fixedSpendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  fixedSpendRows: {
    gap: 7
  },
  fixedSpendTotal: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24
  },
  fixedSpendTotalSlot: {
    alignItems: 'flex-end',
    maxWidth: 132,
    minWidth: 88
  },
  heatCell: {
    aspectRatio: 1,
    borderRadius: 3.5,
    borderWidth: 1.3,
    flex: 1
  },
  heatGrid: {
    alignSelf: 'center',
    gap: 2,
    width: '88%'
  },
  heatGridRow: {
    flexDirection: 'row',
    gap: 2
  },
  heatWeekday: {
    color: colors.subtle,
    flex: 1,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 8,
    fontWeight: '600',
    lineHeight: 11,
    textAlign: 'center'
  },
  heatWeekdayRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 2,
    width: '88%'
  },
  heroAmount: {
    color: '#FFFDF7',
    fontFamily: fontFamilies.monoBold,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 38
  },
  heroAmountSlot: {
    height: 38
  },
  heroBudgetCopy: {
    flex: 1,
    gap: 5,
    justifyContent: 'center',
    minWidth: 0
  },
  heroBudgetFace: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14
  },
  heroBudgetLine: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16
  },
  heroBudgetMeta: {
    color: 'rgba(255,253,247,0.58)',
    fontFamily: fontFamilies.monoBold,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13
  },
  heroCard: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderRadius: 22,
    boxShadow: '0 20px 40px -20px rgba(42,39,34,0.55)',
    gap: 12,
    minHeight: 0,
    overflow: 'hidden',
    paddingBottom: 14,
    paddingHorizontal: 16,
    paddingTop: 14
  },
  heroCombinedFace: {
    gap: 9
  },
  heroFace: {
    backfaceVisibility: 'hidden',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
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
  heroHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  heroMetricLabel: {
    color: 'rgba(255,253,247,0.56)',
    fontFamily: fontFamilies.monoBold,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.2,
    lineHeight: 14
  },
  heroScopeDot: {
    borderRadius: 4,
    height: 8,
    width: 8
  },
  heroScopeDotOverlap: {
    marginLeft: -3
  },
  heroScopeDots: {
    alignItems: 'center',
    flexDirection: 'row',
    minWidth: 14
  },
  heroSecondary: {
    backgroundColor: 'rgba(255,253,247,0.05)',
    borderRadius: 14,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  heroZone: {
    transformOrigin: 'top center'
  },
  historyButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(42,39,34,0.06)',
    borderRadius: 10,
    height: 34,
    justifyContent: 'center',
    width: 34
  },
  historyButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }]
  },
  insightCard: {
    aspectRatio: 1,
    borderRadius: 16,
    flex: 1,
    gap: 8,
    minWidth: 0,
    overflow: 'hidden',
    padding: 12
  },
  insightGrid: {
    flexDirection: 'row',
    gap: 10
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
  insightTitleDark: {
    color: 'rgba(255,253,247,0.60)'
  },
  jumpCloseButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(42,39,34,0.06)',
    borderRadius: 10,
    height: 34,
    justifyContent: 'center',
    width: 34
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
  jumpHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
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
    fontSize: 13,
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
  monthResetDot: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    height: 8,
    width: 8
  },
  monthResetDotPressed: {
    transform: [{ scale: 0.86 }]
  },
  monthTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 33,
    maxWidth: 260
  },
  monthTitleButton: {
    alignItems: 'center',
    borderRadius: 13,
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 6
  },
  monthTitleButtonPressed: {
    backgroundColor: 'rgba(42,39,34,0.05)'
  },
  monthTitleLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0
  },
  monthTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 48
  },
  nowCaption: {
    fontFamily: fontFamilies.regular,
    fontSize: 10.5,
    lineHeight: 13
  },
  nowMetric: {
    gap: 4
  },
  nowMetricAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'right'
  },
  nowMetricAmountSlot: {
    alignItems: 'flex-end',
    flex: 1,
    height: 17,
    minWidth: 0
  },
  nowMetricLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17
  },
  nowMetricLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between'
  },
  quietState: {
    alignItems: 'center',
    flex: 1,
    gap: 6,
    justifyContent: 'center',
    minHeight: 88,
    paddingHorizontal: 8
  },
  quietStateText: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center'
  },
  recentAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'right'
  },
  recentAmountSlot: {
    alignItems: 'flex-end',
    flexShrink: 0,
    height: 15,
    width: 55
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
  },
  sectionLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minWidth: 0
  },
  zenModeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(42,39,34,0.06)',
    borderColor: 'rgba(42,39,34,0.08)',
    borderRadius: 11,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  zenModeButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }]
  },
  zenModeButtonText: {
    color: colors.muted,
    fontFamily: fontFamilies.monoBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
    lineHeight: 13
  }
});
