import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { iconNameForExpenseCategory } from '@/src/lib/categories';
import { formatCompactYen, formatYen } from '@/src/lib/format';
import type { CategoryStat } from '@/src/lib/stats';

type PieChartProps = {
  categories: CategoryStat[];
  totalYen: number;
  onCategoryPress?: (category: CategoryStat, anchorPoint?: AnchorPoint) => void;
  selectedCategoryKey?: string | null;
};

type PieSegment = CategoryStat & {
  path: string;
  segmentLength: number;
};

type AnchorPoint = {
  x: number;
  y: number;
};

const SEGMENT_GAP_LENGTH = 2;
const DONUT_ANIMATION_DURATION_MS = 720;
const DONUT_ANIMATION_EASING = Easing.bezier(0.33, 1, 0.68, 1);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

export function PieChart({
  categories,
  totalYen,
  onCategoryPress,
  selectedCategoryKey
}: PieChartProps) {
  const chartSize = 170;
  const center = chartSize / 2;
  const outerRadius = 68;
  const innerRadius = 48;
  const strokeWidth = outerRadius - innerRadius;
  const strokeRadius = (outerRadius + innerRadius) / 2;
  const circumference = 2 * Math.PI * strokeRadius;
  const segments = useMemo(() => (
    totalYen > 0 ? buildSegments(categories, totalYen, center, strokeRadius, circumference) : []
  ), [categories, center, circumference, strokeRadius, totalYen]);
  const segmentSignature = useMemo(() => (
    segments.map((segment) => `${segment.category}:${segment.amountYen}:${segment.color}`).join('|')
  ), [segments]);
  const [donutProgress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (segments.length === 0) {
      donutProgress.setValue(0);
      return;
    }

    donutProgress.stopAnimation();
    donutProgress.setValue(0);
    Animated.timing(donutProgress, {
      duration: DONUT_ANIMATION_DURATION_MS,
      easing: DONUT_ANIMATION_EASING,
      toValue: 1,
      useNativeDriver: false
    }).start();
  }, [donutProgress, segmentSignature, segments.length]);

  if (totalYen <= 0 || categories.length === 0) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
        <Text style={styles.muted}>No category expenses to chart yet</Text>
      </View>
    );
  }

  function handleCategoryPress(category: CategoryStat, event: GestureResponderEvent) {
    const { pageX, pageY } = event.nativeEvent;
    const anchorPoint = typeof pageX === 'number' && typeof pageY === 'number'
      ? { x: pageX, y: pageY }
      : undefined;

    onCategoryPress?.(category, anchorPoint);
  }

  return (
    <View style={chartStyles.chart}>
      <View style={chartStyles.donutWrap}>
        <Svg height={chartSize} viewBox={`0 0 ${chartSize} ${chartSize}`} width={chartSize}>
          <Circle cx={center} cy={center} fill={colors.tint} r={outerRadius} />
          {segments.length === 1 ? (
            <AnimatedCircle
              cx={center}
              cy={center}
              fill="none"
              onPress={onCategoryPress ? (event) => handleCategoryPress(segments[0], event as unknown as GestureResponderEvent) : undefined}
              r={strokeRadius}
              stroke={segments[0].color}
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={donutProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [circumference, 0]
              })}
              strokeWidth={strokeWidth}
            />
          ) : (
            segments.map((segment) => (
              <AnimatedPath
                d={segment.path}
                fill="none"
                key={`${segment.category}-${segment.path}`}
                onPress={onCategoryPress ? (event) => handleCategoryPress(segment, event as unknown as GestureResponderEvent) : undefined}
                stroke={segment.color}
                strokeDasharray={`${segment.segmentLength} ${segment.segmentLength}`}
                strokeDashoffset={donutProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [segment.segmentLength, 0]
                })}
                strokeLinecap="round"
                strokeWidth={strokeWidth}
              />
            ))
          )}
          <Circle cx={center} cy={center} fill={theme.chart.donutCenter} r={innerRadius} />
          <SvgText
            fill={colors.ink}
            fontFamily={fontFamilies.monoBold}
            fontSize={16}
            fontWeight="600"
            textAnchor="middle"
            x={center}
            y={center - 2}
          >
            {formatCompactYen(totalYen)}
          </SvgText>
          <SvgText
            fill={colors.muted}
            fontFamily={fontFamilies.regular}
            fontSize={11}
            textAnchor="middle"
            x={center}
            y={center + 18}
          >
            Total
          </SvgText>
        </Svg>
      </View>

      <View style={chartStyles.legend}>
        {categories.map((category) => {
          const disabled = !onCategoryPress;
          const selected = selectedCategoryKey === category.detailKey;
          return (
            <Pressable
              accessibilityLabel={`Open ${category.category} category details`}
              accessibilityRole="button"
              disabled={disabled}
              hitSlop={4}
              key={`${category.detailKey}-${category.color}`}
              onPress={(event) => handleCategoryPress(category, event)}
              style={({ pressed }) => [
                chartStyles.categoryRow,
                selected && chartStyles.categoryRowSelected,
                pressed && !disabled && chartStyles.categoryRowPressed
              ]}
            >
              <View style={chartStyles.legendName}>
                <View style={[chartStyles.legendDot, { backgroundColor: category.color }]} />
                <Ionicons color={colors.ink} name={iconNameForExpenseCategory(category.category)} size={18} />
                <Text ellipsizeMode="tail" numberOfLines={1} style={chartStyles.legendText}>
                  {category.category}
                </Text>
              </View>
              <Text style={chartStyles.percentageText}>{category.percentage.toFixed(1)}%</Text>
              <Text adjustsFontSizeToFit numberOfLines={1} style={chartStyles.amountText}>
                {formatYen(category.amountYen)}
              </Text>
              <Ionicons color={colors.subtle} name="chevron-forward" size={16} style={chartStyles.chevron} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function buildSegments(
  categories: CategoryStat[],
  totalYen: number,
  center: number,
  strokeRadius: number,
  circumference: number
): PieSegment[] {
  const segments: PieSegment[] = [];
  const gapLength = categories.length > 1 ? SEGMENT_GAP_LENGTH : 0;
  let cumulativeLength = 0;

  for (const category of categories) {
    const rawSegmentLength = (category.amountYen / totalYen) * circumference;
    const segmentLength = Math.max(0, rawSegmentLength - gapLength);
    const startAngle = -90 + (cumulativeLength / circumference) * 360;
    const endAngle = startAngle + (segmentLength / circumference) * 360;
    segments.push({
      ...category,
      path: describeArc(center, center, strokeRadius, startAngle, endAngle),
      segmentLength
    });
    cumulativeLength += rawSegmentLength;
  }

  return segments;
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 1, end.x, end.y
  ].join(' ');
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;

  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  };
}

const chartStyles = StyleSheet.create({
  amountText: {
    color: colors.muted,
    fontFamily: fontFamilies.mono,
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 86,
    minWidth: 70,
    textAlign: 'right'
  },
  categoryRow: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: -6,
    minHeight: 36,
    paddingHorizontal: 6,
    paddingVertical: 3
  },
  categoryRowPressed: {
    backgroundColor: colors.tint
  },
  categoryRowSelected: {
    backgroundColor: colors.tint
  },
  chart: {
    alignItems: 'center',
    flexDirection: 'column',
    gap: 20
  },
  chevron: {
    flexShrink: 0,
    marginLeft: -3
  },
  donutWrap: {
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    width: '100%'
  },
  legend: {
    gap: 5,
    width: '100%'
  },
  legendDot: {
    borderRadius: 6,
    height: 12,
    width: 12
  },
  legendName: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0
  },
  legendText: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18
  },
  percentageText: {
    color: colors.muted,
    fontFamily: fontFamilies.monoBold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    minWidth: 46,
    textAlign: 'right'
  }
});
