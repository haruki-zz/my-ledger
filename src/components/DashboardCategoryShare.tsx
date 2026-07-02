import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue
} from 'react-native-reanimated';

import { DashboardModule } from '@/src/components/DashboardModule';
import { colors, fontFamilies, theme } from '@/src/components/styles';
import { mutedChartColor } from '@/src/lib/color';
import { formatCompactYen, formatYen } from '@/src/lib/format';
import { motionDuration, motionDurations, motionEasings, useReduceMotion } from '@/src/lib/motion';
import type { CategoryStat } from '@/src/lib/stats';

type DashboardCategoryShareProps = {
  categories: CategoryStat[];
  colorAnimationDurationMs?: number;
  onCategoryPress: (category: CategoryStat) => void;
  selectedCategoryKey?: string | null;
  totalYen: number;
};

const CAPSULE_COUNT = 50;
const BAR_STEP = 6;
const RING_RADIUS = 60;

export function DashboardCategoryShare({
  categories,
  colorAnimationDurationMs = 900,
  onCategoryPress,
  selectedCategoryKey,
  totalYen
}: DashboardCategoryShareProps) {
  const [open, setOpen] = useState(false);
  const visibleCategories = categories.slice(0, 6);
  const measureKey = visibleCategories.map((category) => `${category.detailKey}:${category.amountYen}`).join('|');

  return (
    <DashboardModule
      detail={
        <View style={localStyles.fullLegend}>
          {visibleCategories.length > 0 ? visibleCategories.map((category) => (
            <Pressable
              accessibilityLabel={`Open ${category.category} category details`}
              accessibilityRole="button"
              key={`${category.detailKey}-${category.color}`}
              onPress={() => onCategoryPress(category)}
              style={({ pressed }) => [
                localStyles.fullRow,
                selectedCategoryKey === category.detailKey && localStyles.rowSelected,
                pressed && localStyles.rowPressed
              ]}
            >
              <View style={[localStyles.fullDot, { backgroundColor: mutedChartColor(category.color) }]} />
              <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.fullName}>
                {category.category}
              </Text>
              <Text style={localStyles.fullPercent}>{category.percentage.toFixed(1)}%</Text>
              <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.fullAmount}>
                {formatYen(category.amountYen)}
              </Text>
              <Ionicons color="#C7BDAE" name="chevron-forward" size={15} />
            </Pressable>
          )) : (
            <Text style={localStyles.emptyText}>No category expenses to chart yet</Text>
          )}
        </View>
      }
      expandOnCollapsedAreaPress
      measureKey={`category-share:${measureKey}`}
      middle={visibleCategories.length > 0 ? (
        <CapsuleMorph
          categories={visibleCategories}
          colorAnimationDurationMs={colorAnimationDurationMs}
          open={open}
          totalYen={totalYen}
        />
      ) : null}
      onToggle={() => setOpen((current) => !current)}
      open={open}
      summary={
        <View style={localStyles.summaryLegend}>
          {visibleCategories.length > 0 ? visibleCategories.map((category) => (
            <View key={`${category.detailKey}-${category.color}`} style={localStyles.summaryRow}>
              <View style={[localStyles.summaryDot, { backgroundColor: mutedChartColor(category.color) }]} />
              <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.summaryName}>
                {category.category}
              </Text>
              <Text style={localStyles.summaryPercent}>{category.percentage.toFixed(0)}%</Text>
            </View>
          )) : (
            <Text style={localStyles.emptyText}>No category expenses to chart yet</Text>
          )}
        </View>
      }
      title="Category Share"
    />
  );
}

function CapsuleMorph({
  categories,
  colorAnimationDurationMs,
  open,
  totalYen
}: {
  categories: CategoryStat[];
  colorAnimationDurationMs: number;
  open: boolean;
  totalYen: number;
}) {
  const reduceMotion = useReduceMotion();
  const morphProgress = useSharedValue(open ? 1 : 0);
  const centerProgress = useSharedValue(open ? 1 : 0);
  const colorSlots = useMemo(() => buildCapsuleColors(categories), [categories]);

  useEffect(() => {
    morphProgress.value = withTiming(open ? 1 : 0, {
      duration: motionDuration(motionDurations.data, reduceMotion),
      easing: motionEasings.emphasize
    });
    centerProgress.value = withTiming(open ? 1 : 0, {
      duration: motionDuration(motionDurations.layout, reduceMotion),
      easing: motionEasings.crisp
    });
  }, [centerProgress, morphProgress, open, reduceMotion]);

  const morphStyle = useAnimatedStyle(() => ({
    height: 30 + morphProgress.value * 142
  }));

  const centerStyle = useAnimatedStyle(() => ({
    opacity: centerProgress.value
  }));

  if (totalYen <= 0 || categories.length === 0) {
    return (
      <View style={localStyles.emptyMorph}>
        <Text style={localStyles.emptyText}>No category expenses to chart yet</Text>
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        localStyles.morph,
        morphStyle
      ]}
    >
      {Array.from({ length: CAPSULE_COUNT }, (_, index) => (
        <MorphCapsule
          color={colorSlots[index] || colors.subtle}
          colorAnimationDurationMs={colorAnimationDurationMs}
          index={index}
          key={`cap-${index}`}
          progress={morphProgress}
          reduceMotion={reduceMotion}
        />
      ))}

      <Animated.View style={[localStyles.centerLabel, centerStyle]}>
        <Text style={localStyles.centerAmount}>{formatCompactYen(totalYen)}</Text>
        <Text style={localStyles.centerText}>Total</Text>
      </Animated.View>
    </Animated.View>
  );
}

function MorphCapsule({
  color,
  colorAnimationDurationMs,
  index,
  progress,
  reduceMotion
}: {
  color: string;
  colorAnimationDurationMs: number;
  index: number;
  progress: SharedValue<number>;
  reduceMotion: boolean;
}) {
  const colorProgress = useSharedValue(1);
  const [colorRange, setColorRange] = useState(() => ({
    from: color,
    to: color
  }));
  const angle = (index / CAPSULE_COUNT) * 360 - 90;
  const angleRadians = (angle * Math.PI) / 180;
  const barX = (index - (CAPSULE_COUNT - 1) / 2) * BAR_STEP;
  const ringX = Math.cos(angleRadians) * RING_RADIUS;
  const ringY = Math.sin(angleRadians) * RING_RADIUS;

  useEffect(() => {
    if (colorRange.to === color) {
      return;
    }

    setColorRange({
      from: colorRange.to,
      to: color
    });
    colorProgress.value = 0;
    colorProgress.value = withTiming(1, {
      duration: motionDuration(colorAnimationDurationMs, reduceMotion),
      easing: motionEasings.emphasize
    });
  }, [color, colorAnimationDurationMs, colorProgress, colorRange.to, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      colorProgress.value,
      [0, 1],
      [colorRange.from, colorRange.to]
    ),
    transform: [
      {
        translateX: barX + (ringX - barX) * progress.value
      },
      {
        translateY: ringY * progress.value
      },
      {
        rotate: `${(angle + 90) * progress.value}deg`
      }
    ]
  }));

  return <Animated.View style={[localStyles.capsule, animatedStyle]} testID={`category-share-capsule-${index}`} />;
}

function buildCapsuleColors(categories: CategoryStat[]) {
  if (categories.length === 0) {
    return [];
  }

  const counts = largestRemainder(
    categories.map((category) => category.amountYen),
    CAPSULE_COUNT
  );
  const colorsOut: string[] = [];
  categories.forEach((category, index) => {
    const mutedColor = mutedChartColor(category.color);
    for (let slot = 0; slot < counts[index]; slot += 1) {
      colorsOut.push(mutedColor);
    }
  });

  return colorsOut.slice(0, CAPSULE_COUNT);
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

const localStyles = StyleSheet.create({
  capsule: {
    borderRadius: theme.radii.pill,
    height: 22,
    left: '50%',
    marginLeft: -2.5,
    marginTop: -11,
    position: 'absolute',
    top: '50%',
    width: 5
  },
  centerAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24
  },
  centerLabel: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  centerText: {
    color: colors.subtle,
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    letterSpacing: 0.5,
    lineHeight: 13
  },
  emptyMorph: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16
  },
  emptyText: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center'
  },
  fullAmount: {
    color: colors.muted,
    fontFamily: fontFamilies.mono,
    fontSize: 12,
    lineHeight: 18,
    minWidth: 72,
    textAlign: 'right'
  },
  fullDot: {
    borderRadius: 4,
    height: 11,
    width: 11
  },
  fullLegend: {
    gap: 2,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 4
  },
  fullName: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    minWidth: 0
  },
  fullPercent: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    minWidth: 46,
    textAlign: 'right'
  },
  fullRow: {
    alignItems: 'center',
    borderRadius: 9,
    flexDirection: 'row',
    gap: 10,
    minHeight: 36,
    paddingHorizontal: 6,
    paddingVertical: 6
  },
  morph: {
    position: 'relative'
  },
  rowPressed: {
    backgroundColor: 'rgba(192,137,46,0.08)'
  },
  rowSelected: {
    backgroundColor: 'rgba(192,137,46,0.10)'
  },
  summaryDot: {
    borderRadius: 3,
    height: 9,
    width: 9
  },
  summaryLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 15,
    paddingHorizontal: 16,
    paddingTop: 28
  },
  summaryName: {
    color: colors.muted,
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    minWidth: 0
  },
  summaryPercent: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16
  },
  summaryRow: {
    alignItems: 'center',
    flexBasis: '47%',
    flexDirection: 'row',
    flexGrow: 1,
    gap: 7,
    minWidth: 0
  }
});
