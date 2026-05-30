import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { formatYen } from '@/src/lib/format';
import type { CategoryStat } from '@/src/lib/stats';

type PieChartProps = {
  categories: CategoryStat[];
  totalYen: number;
  onCategoryPress?: (category: CategoryStat, anchorPoint?: AnchorPoint) => void;
  layout?: 'vertical' | 'horizontal';
};

type DisplayCategoryStat = CategoryStat & {
  aggregate?: boolean;
};

export type AnchorPoint = {
  x: number;
  y: number;
};

export function PieChart({ categories, totalYen, onCategoryPress, layout = 'vertical' }: PieChartProps) {
  if (totalYen <= 0 || categories.length === 0) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
        <Text style={styles.muted}>No category expenses to chart yet</Text>
      </View>
    );
  }

  const chartSize = layout === 'horizontal' ? 132 : 160;
  const center = chartSize / 2;
  const outerRadius = layout === 'horizontal' ? 52 : 62;
  const innerRadius = layout === 'horizontal' ? 37 : 47;
  const strokeWidth = outerRadius - innerRadius;
  const strokeRadius = (outerRadius + innerRadius) / 2;
  const circumference = 2 * Math.PI * strokeRadius;
  const displayCategories = compactCategories(categories);
  const segments = displayCategories.reduce<{
    cumulativeLength: number;
    items: (DisplayCategoryStat & { dashOffset: number; segmentLength: number })[];
  }>((state, category) => {
    const segmentLength = (category.amountYen / totalYen) * circumference;
    return {
      cumulativeLength: state.cumulativeLength + segmentLength,
      items: [
        ...state.items,
        {
          ...category,
          dashOffset: circumference / 4 - state.cumulativeLength,
          segmentLength
        }
      ]
    };
  }, { cumulativeLength: 0, items: [] }).items;

  function handleCategoryPress(category: CategoryStat, event: GestureResponderEvent) {
    const { pageX, pageY } = event.nativeEvent;
    const anchorPoint = typeof pageX === 'number' && typeof pageY === 'number'
      ? { x: pageX, y: pageY }
      : undefined;

    onCategoryPress?.(category, anchorPoint);
  }

  return (
    <View style={layout === 'horizontal' ? chartStyles.horizontalChart : chartStyles.verticalChart}>
      <View style={{ alignItems: 'center' }}>
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
                strokeLinecap="butt"
                strokeWidth={strokeWidth}
              />
            ))
          )}
          <Circle cx={center} cy={center} fill={theme.chart.donutCenter} r={innerRadius} />
        </Svg>
      </View>

      <View style={layout === 'horizontal' ? chartStyles.compactLegend : chartStyles.legend}>
        {displayCategories.map((category) => {
          const disabled = !onCategoryPress || Boolean(category.aggregate);
          return (
          <Pressable
            disabled={disabled}
            hitSlop={4}
            key={`${category.category}-${category.color}`}
            onPress={(event) => handleCategoryPress(category, event)}
            style={({ pressed }) => [
              styles.between,
              chartStyles.categoryRow,
              pressed && !disabled && chartStyles.categoryRowPressed
            ]}
          >
            <View style={chartStyles.legendName}>
              <View
                style={{
                  backgroundColor: category.color,
                  borderRadius: 4,
                  height: 12,
                  marginTop: 4,
                  width: 12
                }}
              />
              <Text ellipsizeMode="tail" numberOfLines={1} style={layout === 'horizontal' ? chartStyles.compactLegendText : styles.body}>
                {category.category}
              </Text>
            </View>
            <Text style={layout === 'horizontal' ? chartStyles.compactPercentage : chartStyles.amountText}>
              {layout === 'horizontal' ? `${category.percentage.toFixed(1)}%` : formatYen(category.amountYen)}
            </Text>
          </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function compactCategories(categories: CategoryStat[]): DisplayCategoryStat[] {
  if (categories.length <= 5) {
    return categories;
  }

  const visibleCategories = categories.slice(0, 4);
  const otherCategories = categories.slice(4);
  const otherAmount = otherCategories.reduce((sum, category) => sum + category.amountYen, 0);
  const otherPercentage = otherCategories.reduce((sum, category) => sum + category.percentage, 0);

  return [
    ...visibleCategories,
    {
      amountYen: otherAmount,
      aggregate: true,
      category: 'Other',
      color: colors.subtle,
      percentage: otherPercentage
    }
  ];
}


const chartStyles = StyleSheet.create({
  amountText: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 16,
    fontWeight: '800'
  },
  categoryRow: {
    alignItems: 'flex-start',
    borderRadius: 8,
    marginHorizontal: -6,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  categoryRowPressed: {
    backgroundColor: colors.tint
  },
  compactLegend: {
    flex: 1,
    gap: 8,
    minWidth: 0
  },
  compactLegendText: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.extraBold,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18
  },
  compactPercentage: {
    color: colors.muted,
    fontFamily: fontFamilies.extraBold,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18
  },
  horizontalChart: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 20
  },
  legend: {
    gap: 10
  },
  legendName: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0
  },
  verticalChart: {
    gap: 16
  }
});
