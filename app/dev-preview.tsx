import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle
} from 'react-native-reanimated';

import { DashboardCategoryShare } from '@/src/components/DashboardCategoryShare';
import { DashboardDailyActivity } from '@/src/components/DashboardDailyActivity';
import { colors, fontFamilies, styles } from '@/src/components/styles';
import { SlidingValueText } from '@/src/components/SlidingValueText';
import { BentoCard } from '@/src/components/ui';
import { formatYen } from '@/src/lib/format';
import { motionDuration, motionDurations, motionEasings } from '@/src/lib/motion';
import type { CategoryStat, HeatDay } from '@/src/lib/stats';
import type { ViewStyle } from 'react-native';

const TODAY = '2026-06-20';
const CURRENT_USER_COLOR = '#E0967A';
const OTHER_USER_COLOR = '#5FB8B2';
const FLIP_DURATION_MS = motionDurations.data;

function seededAmount(seed: number) {
  const value = Math.abs(Math.sin(seed) * 10000);
  return Math.round((value % 9000) / 100) * 100;
}

const combinedHeatDays: HeatDay[] = Array.from({ length: 20 }, (_, index) => {
  const day = index + 1;
  const date = `2026-06-${String(day).padStart(2, '0')}`;
  const amount = seededAmount(day * 1.7);
  const selfAmount = Math.round(amount * 0.56);
  return {
    amount,
    byCategory: amount > 0 ? [
      { amount: Math.round(amount * 0.6), color: '#B25A3C', id: 'food_dining', label: 'Food & Dining' },
      { amount: Math.round(amount * 0.4), color: '#8AA248', id: 'household', label: 'Household' }
    ] : [],
    byMember: [
      { amount: selfAmount, color: CURRENT_USER_COLOR, id: 'user-haruki', label: 'Haruki' },
      { amount: amount - selfAmount, color: OTHER_USER_COLOR, id: 'user-nonoka', label: 'Nonoka' }
    ],
    count: amount > 0 ? 2 : 0,
    date
  };
});

const selfHeatDays: HeatDay[] = combinedHeatDays.map((day) => {
  const selfAmount = day.byMember[0]?.amount || 0;
  return {
    amount: selfAmount,
    byCategory: day.byCategory.map((category) => ({ ...category, amount: Math.round(category.amount * 0.56) })),
    byMember: [],
    count: selfAmount > 0 ? day.count : 0,
    date: day.date
  };
});

const combinedCategories: CategoryStat[] = [
  { amountYen: 62000, category: 'Food & Dining', color: '#CB5F43', detailKey: 'food_dining', percentage: 38.2 },
  { amountYen: 34000, category: 'Household', color: '#8AA248', detailKey: 'household', percentage: 21.0 },
  { amountYen: 28000, category: 'Transport', color: '#4F77BE', detailKey: 'transport', percentage: 17.3 },
  { amountYen: 18000, category: 'Housing', color: '#8A6FB6', detailKey: 'housing', percentage: 11.1 },
  { amountYen: 12000, category: 'Utilities', color: '#D2A032', detailKey: 'utilities', percentage: 7.4 },
  { amountYen: 8000, category: 'Entertainment', color: '#A85DA8', detailKey: 'entertainment', percentage: 5.0 }
];

const selfCategories: CategoryStat[] = combinedCategories.map((category) => ({
  ...category,
  amountYen: Math.round(category.amountYen * 0.56)
}));

export default function DevPreviewScreen() {
  const [flipped, setFlipped] = useState(false);
  const [heroShowsBack, setHeroShowsBack] = useState(false);
  const heroFlipProgress = useSharedValue(0);
  const heroFlipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = false;

  const heroFlipStyle = useAnimatedStyle(() => {
    const progress = heroFlipProgress.value;
    const rotateY = progress <= 0.5
      ? interpolate(progress, [0, 0.5], [0, 90], Extrapolation.CLAMP)
      : interpolate(progress, [0.5, 1], [-90, 0], Extrapolation.CLAMP);
    const scale = interpolate(progress, [0, 0.5, 1], [1, 0.92, 1]);
    return { transform: [{ perspective: 900 }, { rotateY: `${rotateY}deg` }, { scale }] };
  });

  useEffect(() => {
    heroFlipProgress.value = withTiming(flipped ? 1 : 0, {
      duration: motionDuration(FLIP_DURATION_MS, reduceMotion),
      easing: motionEasings.emphasize
    });

    if (heroFlipTimerRef.current) {
      clearTimeout(heroFlipTimerRef.current);
    }

    const swapDelay = motionDuration(FLIP_DURATION_MS, reduceMotion) / 2;
    heroFlipTimerRef.current = setTimeout(() => setHeroShowsBack(flipped), swapDelay);
  }, [flipped, heroFlipProgress]);

  const totalYen = flipped ? 162000 : 91000;
  const heatDays = flipped ? combinedHeatDays : selfHeatDays;
  const categories = flipped ? combinedCategories : selfCategories;

  return (
    <ScrollView contentContainerStyle={[styles.content, local.content]} style={styles.page}>
      <BentoCard variant="hero" style={local.heroCard}>
        <View style={local.heroTop}>
          <Text style={local.heroMonth}>Jun 2026</Text>
          <View style={local.periodSegment}>
            {['D', 'W', 'M'].map((label) => (
              <View key={label} style={[local.periodOption, label === 'M' && local.periodOptionActive]}>
                <Text style={[local.periodText, label === 'M' && local.periodTextActive]}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        <HeroFlipZone flipped={flipped} onToggle={() => setFlipped((current) => !current)} style={heroFlipStyle}>
          <View style={local.heroAmountRow}>
            <SlidingValueText
              formatValue={formatYen}
              textStyle={local.heroAmount}
              value={totalYen}
              wrapperStyle={local.heroAmountSlot}
            />
            <View style={local.percentBadge}>
              <Text style={local.percentBadgeText}>+8.3%</Text>
            </View>
          </View>

          {!heroShowsBack ? (
            <View style={local.heroFlipHint}>
              <Ionicons color="rgba(255,253,247,0.42)" name="sync-outline" size={12} />
              <Text style={local.heroFlipHintText}>Tap to see combined with Nonoka</Text>
            </View>
          ) : (
            <View style={local.heroSecondary}>
              <View style={local.memberSplitRow}>
                <MemberSplit amountYen={91000} color={CURRENT_USER_COLOR} label="Haruki" />
                <View style={local.memberDivider} />
                <MemberSplit amountYen={71000} color={OTHER_USER_COLOR} label="Nonoka" />
              </View>
              <View style={local.settleStrip}>
                <Text style={local.settleText}>Haruki to Nonoka <Text style={local.settleAmount}>¥3,200</Text></Text>
              </View>
            </View>
          )}
        </HeroFlipZone>
      </BentoCard>

      <Text style={local.debugLabel}>flipped: {String(flipped)} · heroShowsBack: {String(heroShowsBack)}</Text>

      <DashboardDailyActivity
        days={heatDays}
        monthKey="2026-06"
        onViewHistoryDate={() => {}}
        todayString={TODAY}
      />

      <DashboardCategoryShare
        categories={categories}
        onCategoryPress={() => {}}
        selectedCategoryKey={null}
        totalYen={totalYen}
      />
    </ScrollView>
  );
}

function HeroFlipZone({
  children,
  flipped,
  onToggle,
  style
}: {
  children: ReactNode;
  flipped: boolean;
  onToggle: () => void;
  style: AnimatedStyle<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityLabel={flipped ? 'Show only your spending' : 'Show combined spending with Nonoka'}
      accessibilityRole="button"
      onPress={onToggle}
    >
      <Animated.View style={style}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

function MemberSplit({ amountYen, color, label }: { amountYen: number; color: string; label: string }) {
  return (
    <View style={local.memberSplit}>
      <View style={local.memberName}>
        <View style={[local.memberDot, { backgroundColor: color }]} />
        <Text style={local.memberNameText}>{label}</Text>
      </View>
      <Text style={local.memberAmount}>{formatYen(amountYen)}</Text>
    </View>
  );
}

const local = StyleSheet.create({
  content: {
    gap: 13
  },
  debugLabel: {
    color: colors.subtle,
    fontFamily: fontFamilies.mono,
    fontSize: 10,
    textAlign: 'center'
  },
  heroAmount: {
    color: '#FFFDF7',
    fontFamily: fontFamilies.monoBold,
    fontSize: 37,
    fontWeight: '700',
    lineHeight: 40
  },
  heroAmountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  heroAmountSlot: {
    height: 40
  },
  heroCard: {
    backgroundColor: colors.primary,
    borderRadius: 22,
    gap: 0,
    overflow: 'hidden',
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 11
  },
  heroFlipHint: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: 14,
    paddingVertical: 2
  },
  heroFlipHintText: {
    color: 'rgba(255,253,247,0.42)',
    fontFamily: fontFamilies.regular,
    fontSize: 11
  },
  heroMonth: {
    color: '#FFFDF7',
    fontFamily: fontFamilies.extraBold,
    fontSize: 18,
    fontWeight: '800'
  },
  heroSecondary: {
    backgroundColor: 'rgba(255,253,247,0.05)',
    borderRadius: 14,
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  heroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 12
  },
  memberAmount: {
    color: 'rgba(255,253,247,0.86)',
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 14.5,
    fontWeight: '600'
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
    gap: 6
  },
  memberNameText: {
    color: 'rgba(255,253,247,0.48)',
    fontFamily: fontFamilies.medium,
    fontSize: 11
  },
  memberSplit: {
    flex: 1,
    gap: 4
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
    color: '#E8957B',
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700'
  },
  periodOption: {
    alignItems: 'center',
    borderRadius: 6,
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  periodOptionActive: {
    backgroundColor: 'rgba(255,253,247,0.92)'
  },
  periodSegment: {
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
    fontWeight: '700'
  },
  periodTextActive: {
    color: colors.primary
  },
  settleAmount: {
    color: '#E8957B',
    fontFamily: fontFamilies.monoBold
  },
  settleStrip: {
    minHeight: 36
  },
  settleText: {
    color: 'rgba(255,253,247,0.80)',
    fontFamily: fontFamilies.semiBold,
    fontSize: 12.5
  }
});
