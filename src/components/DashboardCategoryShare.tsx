import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardModule, useReduceMotion } from '@/src/components/DashboardModule';
import { colors, fontFamilies, theme } from '@/src/components/styles';
import { formatCompactYen, formatYen } from '@/src/lib/format';
import type { CategoryStat } from '@/src/lib/stats';

type DashboardCategoryShareProps = {
  categories: CategoryStat[];
  onCategoryPress: (category: CategoryStat) => void;
  selectedCategoryKey?: string | null;
  totalYen: number;
};

const CAPSULE_COUNT = 50;
const BAR_STEP = 6;
const RING_RADIUS = 60;
const MORPH_DURATION_MS = 550;
const MORPH_EASING = Easing.bezier(0.55, 0, 0.2, 1);

export function DashboardCategoryShare({
  categories,
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
              <View style={[localStyles.fullDot, { backgroundColor: category.color }]} />
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
      measureKey={`category-share:${measureKey}`}
      middle={
        <CapsuleMorph
          categories={visibleCategories}
          open={open}
          totalYen={totalYen}
        />
      }
      onToggle={() => setOpen((current) => !current)}
      open={open}
      summary={
        <View style={localStyles.summaryLegend}>
          {visibleCategories.length > 0 ? visibleCategories.map((category) => (
            <View key={`${category.detailKey}-${category.color}`} style={localStyles.summaryRow}>
              <View style={[localStyles.summaryDot, { backgroundColor: category.color }]} />
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
      summaryStat={
        <Text style={localStyles.headerStat}>
          <Text style={localStyles.headerStrong}>{visibleCategories.length}</Text> categories
        </Text>
      }
      title="Category Share"
    />
  );
}

function CapsuleMorph({
  categories,
  open,
  totalYen
}: {
  categories: CategoryStat[];
  open: boolean;
  totalYen: number;
}) {
  const reduceMotion = useReduceMotion();
  const [heightProgress] = useState(() => new Animated.Value(open ? 1 : 0));
  const [centerProgress] = useState(() => new Animated.Value(open ? 1 : 0));
  const [capProgresses] = useState(() => Array.from({ length: CAPSULE_COUNT }, () => new Animated.Value(open ? 1 : 0)));
  const colorSlots = useMemo(() => buildCapsuleColors(categories), [categories]);
  const signature = useMemo(() => categories.map((category) => `${category.detailKey}:${category.amountYen}:${category.color}`).join('|'), [categories]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heightProgress, {
        duration: reduceMotion ? 0 : MORPH_DURATION_MS,
        easing: MORPH_EASING,
        toValue: open ? 1 : 0,
        useNativeDriver: false
      }),
      Animated.timing(centerProgress, {
        delay: open && !reduceMotion ? 200 : 0,
        duration: reduceMotion ? 0 : 350,
        easing: Easing.out(Easing.quad),
        toValue: open ? 1 : 0,
        useNativeDriver: true
      }),
      ...capProgresses.map((progress, index) => (
        Animated.timing(progress, {
          delay: reduceMotion ? 0 : open ? index * 4 : (CAPSULE_COUNT - 1 - index) * 2,
          duration: reduceMotion ? 0 : MORPH_DURATION_MS,
          easing: MORPH_EASING,
          toValue: open ? 1 : 0,
          useNativeDriver: true
        })
      ))
    ]).start();
  }, [capProgresses, centerProgress, heightProgress, open, reduceMotion, signature]);

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
        {
          height: heightProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [30, 172]
          })
        }
      ]}
    >
      {capProgresses.map((progress, index) => {
        const angle = (index / CAPSULE_COUNT) * 360 - 90;
        const angleRadians = (angle * Math.PI) / 180;
        const barX = (index - (CAPSULE_COUNT - 1) / 2) * BAR_STEP;
        const ringX = Math.cos(angleRadians) * RING_RADIUS;
        const ringY = Math.sin(angleRadians) * RING_RADIUS;

        return (
          <Animated.View
            key={`cap-${index}`}
            style={[
              localStyles.capsule,
              {
                backgroundColor: colorSlots[index] || colors.subtle,
                transform: [
                  {
                    translateX: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [barX, ringX]
                    })
                  },
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, ringY]
                    })
                  },
                  {
                    rotate: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', `${angle + 90}deg`]
                    })
                  }
                ]
              }
            ]}
          />
        );
      })}

      <Animated.View style={[localStyles.centerLabel, { opacity: centerProgress }]}>
        <Text style={localStyles.centerAmount}>{formatCompactYen(totalYen)}</Text>
        <Text style={localStyles.centerText}>Total</Text>
      </Animated.View>
    </Animated.View>
  );
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
    for (let slot = 0; slot < counts[index]; slot += 1) {
      colorsOut.push(category.color);
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
  headerStat: {
    color: colors.subtle,
    fontFamily: fontFamilies.mono,
    fontSize: 10,
    lineHeight: 14
  },
  headerStrong: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontWeight: '700'
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
    paddingTop: 13
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
