import { Fragment, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { displayName, formatCompactYen, formatYen } from '@/src/lib/format';
import type { DailyUserStat } from '@/src/lib/stats';

type DailyChartProps = {
  currentUserId: string | null;
  currentUserName: string;
  otherUserId: string | null;
  otherUserName: string;
  series: DailyUserStat[];
  selectedCategoryName?: string | null;
};

const WIDTH = 320;
const HEIGHT = 220;
const PADDING_LEFT = 48;
const PADDING_RIGHT = 14;
const PADDING_TOP = 24;
const PADDING_BOTTOM = 34;
const PLOT_WIDTH = WIDTH - PADDING_LEFT - PADDING_RIGHT;
const PLOT_HEIGHT = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
const CURRENT_COLOR = theme.chart.primary;
const OTHER_COLOR = '#F97316';
const tooltipDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short'
});

export function DailyChart({
  currentUserId,
  currentUserName,
  otherUserId,
  otherUserName,
  series,
  selectedCategoryName
}: DailyChartProps) {
  const maxAmount = Math.max(0, ...series.map((item) => item.totalAmountYen));
  const firstNonZeroIndex = series.findIndex((item) => item.totalAmountYen > 0);
  const [selectedIndex, setSelectedIndex] = useState(firstNonZeroIndex >= 0 ? firstNonZeroIndex : 0);
  const [chartWidth, setChartWidth] = useState(WIDTH);
  const safeSelectedIndex = clamp(selectedIndex, 0, Math.max(0, series.length - 1));
  const labelIndexes = useMemo(() => labelIndexSet(series.length), [series.length]);

  useEffect(() => {
    setSelectedIndex(firstNonZeroIndex >= 0 ? firstNonZeroIndex : 0);
  }, [firstNonZeroIndex, selectedCategoryName, series]);

  if (series.length === 0 || maxAmount <= 0) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 190 }}>
        <Text style={styles.muted}>
          {selectedCategoryName ? `No ${selectedCategoryName} trend yet` : 'No daily expense trend yet'}
        </Text>
      </View>
    );
  }

  const baseline = PADDING_TOP + PLOT_HEIGHT;
  const midline = PADDING_TOP + PLOT_HEIGHT / 2;
  const barSlotWidth = PLOT_WIDTH / series.length;
  const barWidth = Math.max(4, Math.min(12, barSlotWidth * 0.48));
  const points = series.map((item, index) => {
    const x = PADDING_LEFT + barSlotWidth * index + barSlotWidth / 2;
    const currentAmount = currentUserId ? item.amountsByUserId[currentUserId] || 0 : 0;
    const otherAmount = otherUserId ? item.amountsByUserId[otherUserId] || 0 : 0;
    const currentHeight = (currentAmount / maxAmount) * PLOT_HEIGHT;
    const otherHeight = (otherAmount / maxAmount) * PLOT_HEIGHT;
    const totalHeight = (item.totalAmountYen / maxAmount) * PLOT_HEIGHT;
    return {
      ...item,
      x,
      currentAmount,
      currentHeight,
      otherAmount,
      otherHeight,
      totalHeight,
      topY: baseline - totalHeight
    };
  });
  const selectedPoint = points[safeSelectedIndex];
  const tooltip = tooltipLayout(selectedPoint.x);

  function selectPointAt(locationX: number) {
    const scaledX = (locationX / Math.max(chartWidth, 1)) * WIDTH;
    const index = Math.floor((scaledX - PADDING_LEFT) / Math.max(barSlotWidth, 1));
    setSelectedIndex(clamp(index, 0, series.length - 1));
  }

  return (
    <Pressable
      onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}
      onPress={(event) => selectPointAt(event.nativeEvent.locationX)}
      style={{ gap: 10 }}
    >
      <Svg height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%">
        <Line stroke={theme.chart.grid} strokeWidth={1} x1={PADDING_LEFT} x2={WIDTH - PADDING_RIGHT} y1={baseline} y2={baseline} />
        <Line stroke={theme.chart.grid} strokeWidth={1} x1={PADDING_LEFT} x2={WIDTH - PADDING_RIGHT} y1={midline} y2={midline} />
        <Line stroke={theme.chart.grid} strokeWidth={1} x1={PADDING_LEFT} x2={WIDTH - PADDING_RIGHT} y1={PADDING_TOP} y2={PADDING_TOP} />
        <SvgText fill={colors.muted} fontFamily={fontFamilies.regular} fontSize={10} x={4} y={PADDING_TOP + 4}>
          {formatCompactYen(maxAmount)}
        </SvgText>
        <SvgText fill={colors.muted} fontFamily={fontFamilies.regular} fontSize={10} x={4} y={midline + 4}>
          {formatCompactYen(maxAmount / 2)}
        </SvgText>
        <SvgText fill={colors.muted} fontFamily={fontFamilies.regular} fontSize={10} x={4} y={baseline + 4}>
          ¥0
        </SvgText>

        {points.map((point, index) => {
          const currentY = baseline - point.currentHeight;
          const otherY = baseline - point.currentHeight - point.otherHeight;
          return (
            <Fragment key={point.date}>
              {point.currentHeight > 0 ? (
                <Rect
                  fill={CURRENT_COLOR}
                  height={Math.max(point.currentHeight, 2)}
                  rx={3}
                  width={barWidth}
                  x={point.x - barWidth / 2}
                  y={currentY}
                />
              ) : null}
              {point.otherHeight > 0 ? (
                <Rect
                  fill={OTHER_COLOR}
                  height={Math.max(point.otherHeight, 2)}
                  rx={3}
                  width={barWidth}
                  x={point.x - barWidth / 2}
                  y={otherY}
                />
              ) : null}
            </Fragment>
          );
        })}

        {selectedPoint.totalAmountYen > 0 ? (
          <>
            <Circle cx={selectedPoint.x} cy={selectedPoint.topY} fill={colors.surface} r={7} stroke="rgba(15,118,110,0.26)" strokeWidth={4} />
            <Circle cx={selectedPoint.x} cy={selectedPoint.topY} fill={colors.surface} r={3} stroke={CURRENT_COLOR} strokeWidth={2} />
            <Path d={`M ${selectedPoint.x - 6} ${tooltip.y + tooltip.height} L ${selectedPoint.x} ${tooltip.y + tooltip.height + 7} L ${selectedPoint.x + 6} ${tooltip.y + tooltip.height} Z`} fill="#172033" />
            <Rect fill="#172033" height={tooltip.height} rx={8} width={tooltip.width} x={tooltip.x} y={tooltip.y} />
            <SvgText fill="rgba(255,255,255,0.72)" fontFamily={fontFamilies.regular} fontSize={10} x={tooltip.x + 10} y={tooltip.y + 16}>
              {formatTooltipDate(selectedPoint.date)}
            </SvgText>
            <SvgText fill="#FFFFFF" fontFamily={fontFamilies.bold} fontSize={15} fontWeight="700" x={tooltip.x + 10} y={tooltip.y + 36}>
              {formatYen(selectedPoint.totalAmountYen)}
            </SvgText>
            <SvgText fill="rgba(255,255,255,0.76)" fontFamily={fontFamilies.regular} fontSize={9} x={tooltip.x + 10} y={tooltip.y + 53}>
              {displayName(currentUserName)} {formatCompactYen(selectedPoint.currentAmount)}
            </SvgText>
            {otherUserId ? (
              <SvgText fill="rgba(255,255,255,0.76)" fontFamily={fontFamilies.regular} fontSize={9} x={tooltip.x + 10} y={tooltip.y + 66}>
                {displayName(otherUserName)} {formatCompactYen(selectedPoint.otherAmount)}
              </SvgText>
            ) : null}
          </>
        ) : null}

        {labelIndexes.map((index) => (
          <SvgText fill={colors.muted} fontFamily={fontFamilies.regular} fontSize={10} key={series[index].date} textAnchor="middle" x={points[index].x} y={HEIGHT - 10}>
            {series[index].label}
          </SvgText>
        ))}
      </Svg>
    </Pressable>
  );
}

function tooltipLayout(x: number) {
  const width = 118;
  const height = 74;
  return {
    height,
    width,
    x: clamp(x - width / 2, PADDING_LEFT, WIDTH - PADDING_RIGHT - width),
    y: 2
  };
}

function labelIndexSet(length: number) {
  if (length <= 7) {
    return Array.from({ length }, (_, index) => index);
  }

  const indexes = [0, 4, 9, 14, 19, 24, 29, length - 1].filter((index) => index >= 0 && index < length);
  return [...new Set(indexes)];
}

function formatTooltipDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return tooltipDateFormatter.format(new Date(year, month - 1, day));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
