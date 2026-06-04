import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { iconNameForExpenseCategory } from '@/src/lib/categories';
import { formatCompactYen, formatYen } from '@/src/lib/format';
import type { CategoryStat } from '@/src/lib/stats';

type PieChartProps = {
  categories: CategoryStat[];
  totalYen: number;
  onCategoryPress?: (category: CategoryStat, anchorPoint?: AnchorPoint) => void;
  selectedCategoryName?: string | null;
};

type PieSegment = CategoryStat & {
  dashOffset: number;
  segmentLength: number;
};

export type AnchorPoint = {
  x: number;
  y: number;
};

const SEGMENT_GAP_LENGTH = 2;

export function PieChart({
  categories,
  totalYen,
  onCategoryPress,
  selectedCategoryName
}: PieChartProps) {
  if (totalYen <= 0 || categories.length === 0) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
        <Text style={styles.muted}>No category expenses to chart yet</Text>
      </View>
    );
  }

  const chartSize = 170;
  const center = chartSize / 2;
  const outerRadius = 68;
  const innerRadius = 48;
  const strokeWidth = outerRadius - innerRadius;
  const strokeRadius = (outerRadius + innerRadius) / 2;
  const circumference = 2 * Math.PI * strokeRadius;
  const segments = buildSegments(categories, totalYen, circumference);

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
          <Circle cx={center} cy={center} fill="rgba(15,118,110,0.08)" r={outerRadius} />
          {segments.length === 1 ? (
            <Circle
              cx={center}
              cy={center}
              fill="none"
              r={strokeRadius}
              stroke={segments[0].color}
              strokeWidth={strokeWidth}
            />
          ) : (
            segments.map((segment) => (
              <Circle
                cx={center}
                cy={center}
                fill="none"
                key={`${segment.category}-${segment.dashOffset}`}
                r={strokeRadius}
                stroke={segment.color}
                strokeDasharray={`${segment.segmentLength} ${circumference - segment.segmentLength}`}
                strokeDashoffset={segment.dashOffset}
                strokeLinecap="round"
                strokeWidth={strokeWidth}
              />
            ))
          )}
          <Circle cx={center} cy={center} fill={theme.chart.donutCenter} r={innerRadius} />
          <SvgText
            fill={colors.ink}
            fontFamily={fontFamilies.bold}
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
          const selected = selectedCategoryName === category.category;
          return (
            <Pressable
              disabled={disabled}
              hitSlop={4}
              key={`${category.category}-${category.color}`}
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
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function buildSegments(categories: CategoryStat[], totalYen: number, circumference: number): PieSegment[] {
  const segments: PieSegment[] = [];
  const gapLength = categories.length > 1 ? SEGMENT_GAP_LENGTH : 0;
  let cumulativeLength = 0;

  for (const category of categories) {
    const rawSegmentLength = (category.amountYen / totalYen) * circumference;
    segments.push({
      ...category,
      dashOffset: circumference / 4 - cumulativeLength,
      segmentLength: Math.max(0, rawSegmentLength - gapLength)
    });
    cumulativeLength += rawSegmentLength;
  }

  return segments;
}

const chartStyles = StyleSheet.create({
  amountText: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 92,
    minWidth: 76,
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
    backgroundColor: 'rgba(15,118,110,0.08)'
  },
  chart: {
    alignItems: 'center',
    flexDirection: 'column',
    gap: 20
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
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    minWidth: 46,
    textAlign: 'right'
  }
});
