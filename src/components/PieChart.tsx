import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedProps,
  useSharedValue,
  withTiming,
  type SharedValue
} from 'react-native-reanimated';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { iconNameForExpenseCategory } from '@/src/lib/categories';
import { formatCompactYen, formatYen } from '@/src/lib/format';
import { motionDuration, motionDurations, motionEasings, useReduceMotion } from '@/src/lib/motion';
import type { CategoryStat } from '@/src/lib/stats';

type PieChartProps = {
  categories: CategoryStat[];
  colorAnimationDurationMs?: number;
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
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

export function PieChart({
  categories,
  colorAnimationDurationMs = 900,
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
  const reduceMotion = useReduceMotion();
  const segments = useMemo(() => (
    totalYen > 0 ? buildSegments(categories, totalYen, center, strokeRadius, circumference) : []
  ), [categories, center, circumference, strokeRadius, totalYen]);
  const segmentSignature = useMemo(() => (
    segments.map((segment) => `${segment.category}:${segment.amountYen}:${segment.color}`).join('|')
  ), [segments]);
  const donutProgress = useSharedValue(0);

  useEffect(() => {
    if (segments.length === 0) {
      donutProgress.value = 0;
      return;
    }

    donutProgress.value = 0;
    donutProgress.value = withTiming(1, {
      duration: motionDuration(motionDurations.large, reduceMotion),
      easing: motionEasings.crisp
    });
  }, [donutProgress, reduceMotion, segmentSignature, segments.length]);

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
            <DonutCircle
              category={segments[0]}
              center={center}
              colorAnimationDurationMs={colorAnimationDurationMs}
              circumference={circumference}
              onPress={onCategoryPress ? (event) => handleCategoryPress(segments[0], event as unknown as GestureResponderEvent) : undefined}
              progress={donutProgress}
              radius={strokeRadius}
              strokeWidth={strokeWidth}
            />
          ) : (
            segments.map((segment) => (
              <DonutSegment
                key={`${segment.category}-${segment.path}`}
                colorAnimationDurationMs={colorAnimationDurationMs}
                onPress={onCategoryPress ? (event) => handleCategoryPress(segment, event as unknown as GestureResponderEvent) : undefined}
                progress={donutProgress}
                segment={segment}
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

function DonutCircle({
  category,
  center,
  colorAnimationDurationMs,
  circumference,
  onPress,
  progress,
  radius,
  strokeWidth
}: {
  category: PieSegment;
  center: number;
  colorAnimationDurationMs: number;
  circumference: number;
  onPress?: (event: unknown) => void;
  progress: SharedValue<number>;
  radius: number;
  strokeWidth: number;
}) {
  const reduceMotion = useReduceMotion();
  const strokeColorProgress = useSharedValue(1);
  const [strokeColorRange, setStrokeColorRange] = useState(() => ({
    from: category.color,
    to: category.color
  }));

  useEffect(() => {
    if (strokeColorRange.to === category.color) {
      return;
    }

    setStrokeColorRange({
      from: strokeColorRange.to,
      to: category.color
    });
    strokeColorProgress.value = 0;
    strokeColorProgress.value = withTiming(1, {
      duration: motionDuration(colorAnimationDurationMs, reduceMotion),
      easing: motionEasings.emphasize
    });
  }, [category.color, colorAnimationDurationMs, reduceMotion, strokeColorProgress, strokeColorRange.to]);

  const animatedProps = useAnimatedProps(() => ({
    stroke: interpolateColor(
      strokeColorProgress.value,
      [0, 1],
      [strokeColorRange.from, strokeColorRange.to]
    ),
    strokeDashoffset: circumference * (1 - progress.value)
  }));

  return (
    <AnimatedCircle
      animatedProps={animatedProps}
      cx={center}
      cy={center}
      fill="none"
      onPress={onPress}
      r={radius}
      strokeDasharray={`${circumference} ${circumference}`}
      strokeWidth={strokeWidth}
    />
  );
}

function DonutSegment({
  colorAnimationDurationMs,
  onPress,
  progress,
  segment,
  strokeWidth
}: {
  colorAnimationDurationMs: number;
  onPress?: (event: unknown) => void;
  progress: SharedValue<number>;
  segment: PieSegment;
  strokeWidth: number;
}) {
  const reduceMotion = useReduceMotion();
  const strokeColorProgress = useSharedValue(1);
  const [strokeColorRange, setStrokeColorRange] = useState(() => ({
    from: segment.color,
    to: segment.color
  }));

  useEffect(() => {
    if (strokeColorRange.to === segment.color) {
      return;
    }

    setStrokeColorRange({
      from: strokeColorRange.to,
      to: segment.color
    });
    strokeColorProgress.value = 0;
    strokeColorProgress.value = withTiming(1, {
      duration: motionDuration(colorAnimationDurationMs, reduceMotion),
      easing: motionEasings.emphasize
    });
  }, [colorAnimationDurationMs, reduceMotion, segment.color, strokeColorProgress, strokeColorRange.to]);

  const animatedProps = useAnimatedProps(() => ({
    stroke: interpolateColor(
      strokeColorProgress.value,
      [0, 1],
      [strokeColorRange.from, strokeColorRange.to]
    ),
    strokeDashoffset: segment.segmentLength * (1 - progress.value)
  }));

  return (
    <AnimatedPath
      animatedProps={animatedProps}
      d={segment.path}
      fill="none"
      onPress={onPress}
      strokeDasharray={`${segment.segmentLength} ${segment.segmentLength}`}
      strokeLinecap="round"
      strokeWidth={strokeWidth}
    />
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
