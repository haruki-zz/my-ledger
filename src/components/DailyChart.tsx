import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { displayName, formatCompactYen, formatYen } from '@/src/lib/format';
import { motionDuration, motionDurations, motionEasings, useReduceMotion } from '@/src/lib/motion';
import {
  trendAmountForVisualRatio,
  trendScaleMaxForAmounts,
  trendVisualRatioForAmount,
  type DailyUserStat
} from '@/src/lib/stats';

type DailyChartProps = {
  currentUserColor?: string;
  currentUserId: string | null;
  currentUserName: string;
  otherUserColor?: string;
  otherUserId: string | null;
  otherUserName: string;
  series: DailyUserStat[];
  selectedCategoryName?: string | null;
  todayString?: string;
};

type BarTargetGroup = {
  barWidth: number;
  currentTargetHeight: number;
  date: string;
  otherTargetHeight: number;
  x: number;
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
const tooltipDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short'
});
const AnimatedRect = Animated.createAnimatedComponent(Rect);

export function DailyChart({
  currentUserColor = CURRENT_COLOR,
  currentUserId,
  currentUserName,
  otherUserColor = CURRENT_COLOR,
  otherUserId,
  otherUserName,
  series,
  selectedCategoryName,
  todayString
}: DailyChartProps) {
  const maxAmount = Math.max(0, ...series.map((item) => item.totalAmountYen));
  const visualScaleMax = useMemo(
    () => trendScaleMaxForAmounts(series.map((item) => item.totalAmountYen)),
    [series]
  );
  const reduceMotion = useReduceMotion();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [chartWidth, setChartWidth] = useState(WIDTH);
  const hideTooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safeSelectedIndex = selectedIndex === null ? null : clamp(selectedIndex, 0, Math.max(0, series.length - 1));
  const labelIndexes = useMemo(() => labelIndexSet(series.length), [series.length]);
  const baseline = PADDING_TOP + PLOT_HEIGHT;
  const midline = PADDING_TOP + PLOT_HEIGHT / 2;
  const elapsedSeries = todayString ? series.filter((item) => item.date <= todayString) : series;
  const averageAmount = series.reduce((sum, item) => sum + item.totalAmountYen, 0) / Math.max(1, elapsedSeries.length || series.length);
  const averageY = visualScaleMax > 0 ? baseline - trendVisualRatioForAmount(averageAmount, visualScaleMax) * PLOT_HEIGHT : baseline;
  const barSlotWidth = series.length > 0 ? PLOT_WIDTH / series.length : PLOT_WIDTH;
  const barWidth = Math.max(4, Math.min(12, barSlotWidth * 0.48));
  const midlineAmount = trendAmountForVisualRatio(0.5, visualScaleMax);
  const topAxisLabel = maxAmount > visualScaleMax ? `${formatCompactYen(visualScaleMax)}+` : formatCompactYen(visualScaleMax);
  const points = useMemo(() => {
    if (series.length === 0 || visualScaleMax <= 0) {
      return [];
    }

    return series.map((item, index) => {
      const x = PADDING_LEFT + barSlotWidth * index + barSlotWidth / 2;
      const currentAmount = currentUserId ? item.amountsByUserId[currentUserId] || 0 : 0;
      const otherAmount = otherUserId ? item.amountsByUserId[otherUserId] || 0 : 0;
      const totalHeight = trendVisualRatioForAmount(item.totalAmountYen, visualScaleMax) * PLOT_HEIGHT;
      const currentHeight = item.totalAmountYen > 0 ? totalHeight * (currentAmount / item.totalAmountYen) : 0;
      const otherHeight = item.totalAmountYen > 0 ? totalHeight * (otherAmount / item.totalAmountYen) : 0;
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
  }, [barSlotWidth, baseline, currentUserId, otherUserId, series, visualScaleMax]);
  const barTargetGroups = useMemo<BarTargetGroup[]>(() => (
    points.map((point) => ({
      barWidth,
      currentTargetHeight: visualBarHeight(point.currentHeight),
      date: point.date,
      otherTargetHeight: visualBarHeight(point.otherHeight),
      x: point.x
    }))
  ), [barWidth, points]);
  const selectedPoint = safeSelectedIndex === null ? null : points[safeSelectedIndex];
  const tooltip = selectedPoint ? tooltipLayout(selectedPoint.x) : null;

  useEffect(() => {
    setSelectedIndex(null);
    if (hideTooltipTimer.current) {
      clearTimeout(hideTooltipTimer.current);
      hideTooltipTimer.current = null;
    }
  }, [selectedCategoryName, series]);

  useEffect(() => () => {
    if (hideTooltipTimer.current) {
      clearTimeout(hideTooltipTimer.current);
    }
  }, []);

  if (series.length === 0 || maxAmount <= 0) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 190 }}>
        <Text style={styles.muted}>
          {selectedCategoryName ? `No ${selectedCategoryName} trend yet` : 'No daily expense trend yet'}
        </Text>
      </View>
    );
  }

  function handleChartPress(event: GestureResponderEvent) {
    const locationX = getPressLocationX(event);
    if (locationX === null) {
      return;
    }
    selectPointAt(locationX);
  }

  function selectPointAt(locationX: number) {
    const scaledX = (locationX / Math.max(chartWidth, 1)) * WIDTH;
    const index = Math.floor((scaledX - PADDING_LEFT) / Math.max(barSlotWidth, 1));
    const nextIndex = clamp(index, 0, series.length - 1);

    if (points[nextIndex]?.totalAmountYen <= 0) {
      setSelectedIndex(null);
      if (hideTooltipTimer.current) {
        clearTimeout(hideTooltipTimer.current);
        hideTooltipTimer.current = null;
      }
      return;
    }

    setSelectedIndex(nextIndex);
    if (hideTooltipTimer.current) {
      clearTimeout(hideTooltipTimer.current);
    }
    hideTooltipTimer.current = setTimeout(() => {
      setSelectedIndex(null);
      hideTooltipTimer.current = null;
    }, 3000);
  }

  return (
    <Pressable
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (nextWidth > 0) {
          setChartWidth(nextWidth);
        }
      }}
      onPress={handleChartPress}
      style={{ gap: 10 }}
    >
      <Svg height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%">
        <Line stroke={theme.chart.grid} strokeWidth={1} x1={PADDING_LEFT} x2={WIDTH - PADDING_RIGHT} y1={baseline} y2={baseline} />
        <Line stroke={theme.chart.grid} strokeWidth={1} x1={PADDING_LEFT} x2={WIDTH - PADDING_RIGHT} y1={midline} y2={midline} />
        <Line stroke={theme.chart.grid} strokeWidth={1} x1={PADDING_LEFT} x2={WIDTH - PADDING_RIGHT} y1={PADDING_TOP} y2={PADDING_TOP} />
        <Line
          stroke="rgba(192,137,46,0.55)"
          strokeDasharray="4 4"
          strokeWidth={1}
          x1={PADDING_LEFT}
          x2={WIDTH - PADDING_RIGHT}
          y1={averageY}
          y2={averageY}
        />
        <SvgText fill={colors.muted} fontFamily={fontFamilies.mono} fontSize={10} x={4} y={PADDING_TOP + 4}>
          {topAxisLabel}
        </SvgText>
        <SvgText fill={colors.muted} fontFamily={fontFamilies.mono} fontSize={10} x={4} y={midline + 4}>
          {formatCompactYen(midlineAmount)}
        </SvgText>
        <SvgText fill={colors.muted} fontFamily={fontFamilies.mono} fontSize={10} x={4} y={baseline + 4}>
          ¥0
        </SvgText>

        {barTargetGroups.map((group) => (
          <ChartBarGroup
            baseline={baseline}
            currentColor={currentUserColor}
            currentTargetHeight={group.currentTargetHeight}
            future={Boolean(todayString && group.date > todayString)}
            key={group.date}
            otherColor={otherUserColor}
            otherTargetHeight={group.otherTargetHeight}
            reduceMotion={reduceMotion}
            width={group.barWidth}
            x={group.x}
          />
        ))}

        {selectedPoint && tooltip ? (
          <>
            <Circle cx={selectedPoint.x} cy={selectedPoint.topY} fill={colors.surface} r={7} stroke={colors.secondary} strokeWidth={4} />
            <Circle cx={selectedPoint.x} cy={selectedPoint.topY} fill={colors.surface} r={3} stroke={currentUserColor} strokeWidth={2} />
            <Path d={`M ${selectedPoint.x - 6} ${tooltip.y + tooltip.height} L ${selectedPoint.x} ${tooltip.y + tooltip.height + 7} L ${selectedPoint.x + 6} ${tooltip.y + tooltip.height} Z`} fill="#172033" />
            <Rect fill="#172033" height={tooltip.height} rx={8} width={tooltip.width} x={tooltip.x} y={tooltip.y} />
            <SvgText fill="rgba(255,255,255,0.72)" fontFamily={fontFamilies.mono} fontSize={10} x={tooltip.x + 10} y={tooltip.y + 16}>
              {formatTooltipDate(selectedPoint.date)}
            </SvgText>
            <SvgText fill="#FFFFFF" fontFamily={fontFamilies.monoBold} fontSize={15} fontWeight="700" x={tooltip.x + 10} y={tooltip.y + 36}>
              {formatYen(selectedPoint.totalAmountYen)}
            </SvgText>
            <SvgText fill="rgba(255,255,255,0.76)" fontFamily={fontFamilies.mono} fontSize={9} x={tooltip.x + 10} y={tooltip.y + 53}>
              {displayName(currentUserName)} {formatCompactYen(selectedPoint.currentAmount)}
            </SvgText>
            {otherUserId ? (
              <SvgText fill="rgba(255,255,255,0.76)" fontFamily={fontFamilies.mono} fontSize={9} x={tooltip.x + 10} y={tooltip.y + 66}>
                {displayName(otherUserName)} {formatCompactYen(selectedPoint.otherAmount)}
              </SvgText>
            ) : null}
          </>
        ) : null}

        {labelIndexes.map((index) => (
          <SvgText fill={colors.muted} fontFamily={fontFamilies.mono} fontSize={10} key={series[index].date} textAnchor="middle" x={points[index].x} y={HEIGHT - 10}>
            {series[index].label}
          </SvgText>
        ))}
      </Svg>
    </Pressable>
  );
}

function ChartBarGroup({
  baseline,
  currentColor,
  currentTargetHeight,
  future,
  otherColor,
  otherTargetHeight,
  reduceMotion,
  width,
  x
}: {
  baseline: number;
  currentColor: string;
  currentTargetHeight: number;
  future: boolean;
  otherColor: string;
  otherTargetHeight: number;
  reduceMotion: boolean;
  width: number;
  x: number;
}) {
  const currentHeight = useSharedValue(0);
  const otherHeight = useSharedValue(0);

  useEffect(() => {
    const timingConfig = {
      duration: motionDuration(motionDurations.data, reduceMotion),
      easing: motionEasings.crisp
    };
    currentHeight.value = withTiming(currentTargetHeight, timingConfig);
    otherHeight.value = withTiming(otherTargetHeight, timingConfig);
  }, [currentHeight, currentTargetHeight, otherHeight, otherTargetHeight, reduceMotion]);

  const currentProps = useAnimatedProps(() => ({
    height: currentHeight.value,
    y: baseline - currentHeight.value
  }));
  const otherProps = useAnimatedProps(() => ({
    height: otherHeight.value,
    y: baseline - currentHeight.value - otherHeight.value
  }));

  return (
    <>
      <AnimatedRect
        animatedProps={currentProps}
        fill={currentColor}
        opacity={future ? 0.25 : 1}
        rx={3}
        width={width}
        x={x - width / 2}
      />
      <AnimatedRect
        animatedProps={otherProps}
        fill={otherColor}
        opacity={future ? 0.25 : 1}
        rx={3}
        width={width}
        x={x - width / 2}
      />
    </>
  );
}

function visualBarHeight(height: number) {
  return height > 0 ? Math.max(height, 2) : 0;
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

function getPressLocationX(event: GestureResponderEvent): number | null {
  const nativeEvent = event.nativeEvent as GestureResponderEvent['nativeEvent'] & {
    clientX?: number;
    offsetX?: number;
  };

  const locationX = nativeEvent.locationX;
  if (typeof locationX === 'number' && Number.isFinite(locationX)) {
    return locationX;
  }

  const offsetX = nativeEvent.offsetX;
  if (typeof offsetX === 'number' && Number.isFinite(offsetX)) {
    return offsetX;
  }

  const webEvent = event as GestureResponderEvent & {
    currentTarget?: {
      getBoundingClientRect?: () => { left: number };
    };
  };
  const clientX = nativeEvent.clientX ?? nativeEvent.pageX;
  const left = webEvent.currentTarget?.getBoundingClientRect?.().left;

  if (typeof clientX === 'number' && typeof left === 'number' && Number.isFinite(clientX) && Number.isFinite(left)) {
    return clientX - left;
  }

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn('DailyChart press ignored because no horizontal press coordinate was available.');
  }

  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
