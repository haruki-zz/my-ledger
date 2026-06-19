import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { displayName, formatCompactYen, formatYen } from '@/src/lib/format';
import type { DailyUserStat } from '@/src/lib/stats';

type DailyChartProps = {
  currentUserColor?: string;
  currentUserId: string | null;
  currentUserName: string;
  otherUserColor?: string;
  otherUserId: string | null;
  otherUserName: string;
  series: DailyUserStat[];
  selectedCategoryName?: string | null;
};

type BarTargetGroup = {
  animationDelayMs: number;
  barWidth: number;
  currentKey: string | null;
  currentTargetHeight: number;
  date: string;
  otherKey: string | null;
  otherTargetHeight: number;
  x: number;
};

type AnimatedBarGroup = BarTargetGroup & {
  currentHeight: Animated.Value | null;
  otherHeight: Animated.Value | null;
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
const BAR_ANIMATION_DURATION_MS = 720;
const BAR_COLUMN_STAGGER_MS = 14;
const BAR_STAGGER_BUDGET_MS = 180;
const BAR_ANIMATION_EASING = Easing.bezier(0.33, 1, 0.68, 1);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

export function DailyChart({
  currentUserColor = CURRENT_COLOR,
  currentUserId,
  currentUserName,
  otherUserColor = CURRENT_COLOR,
  otherUserId,
  otherUserName,
  series,
  selectedCategoryName
}: DailyChartProps) {
  const maxAmount = Math.max(0, ...series.map((item) => item.totalAmountYen));
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [chartWidth, setChartWidth] = useState(WIDTH);
  const [animatedBarGroups, setAnimatedBarGroups] = useState<AnimatedBarGroup[]>([]);
  const hideTooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barHeights = useRef(new Map<string, Animated.Value>());
  const barGroupsRef = useRef<AnimatedBarGroup[]>([]);
  const barAnimationSequence = useRef(0);
  const safeSelectedIndex = selectedIndex === null ? null : clamp(selectedIndex, 0, Math.max(0, series.length - 1));
  const labelIndexes = useMemo(() => labelIndexSet(series.length), [series.length]);
  const baseline = PADDING_TOP + PLOT_HEIGHT;
  const midline = PADDING_TOP + PLOT_HEIGHT / 2;
  const barSlotWidth = series.length > 0 ? PLOT_WIDTH / series.length : PLOT_WIDTH;
  const barWidth = Math.max(4, Math.min(12, barSlotWidth * 0.48));
  const points = useMemo(() => {
    if (series.length === 0 || maxAmount <= 0) {
      return [];
    }

    return series.map((item, index) => {
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
  }, [barSlotWidth, baseline, currentUserId, maxAmount, otherUserId, series]);
  const barTargetGroups = useMemo(() => (
    points.map((point, index) => ({
      animationDelayMs: barColumnDelay(index, points.length),
      barWidth,
      currentKey: currentUserId ? barKey(point.date, currentUserId) : null,
      currentTargetHeight: visualBarHeight(point.currentHeight),
      date: point.date,
      otherKey: otherUserId ? barKey(point.date, otherUserId) : null,
      otherTargetHeight: visualBarHeight(point.otherHeight),
      x: point.x
    }))
  ), [barWidth, currentUserId, otherUserId, points]);
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

  // Keep outgoing bars around long enough to shrink to zero, then prune their
  // animated values. Cleanup also prunes when a new period/month interrupts.
  useEffect(() => {
    const barHeightValues = barHeights.current;
    if (barTargetGroups.length === 0) {
      barGroupsRef.current = [];
      setAnimatedBarGroups([]);
      pruneAnimatedBarValues([], barHeightValues);
      return;
    }

    const targetDates = new Set(barTargetGroups.map((group) => group.date));
    const shouldAnimate = true;
    const nextGroups: AnimatedBarGroup[] = barTargetGroups.map((group) => ({
      ...group,
      currentHeight: group.currentKey ? animatedBarValue(group.currentKey, group.currentTargetHeight, shouldAnimate, barHeightValues) : null,
      otherHeight: group.otherKey ? animatedBarValue(group.otherKey, group.otherTargetHeight, shouldAnimate, barHeightValues) : null
    }));

    for (const previousGroup of barGroupsRef.current) {
      if (targetDates.has(previousGroup.date)) {
        continue;
      }

      nextGroups.push({
        ...previousGroup,
        currentTargetHeight: 0,
        otherTargetHeight: 0
      });
    }

    barGroupsRef.current = nextGroups;
    setAnimatedBarGroups(nextGroups);

    if (!shouldAnimate) {
      pruneAnimatedBarValues(nextGroups, barHeightValues);
      return;
    }

    const sequence = barAnimationSequence.current + 1;
    barAnimationSequence.current = sequence;
    const animations = nextGroups.flatMap((group) => {
      const groupAnimations: Animated.CompositeAnimation[] = [];

      if (group.currentHeight) {
        group.currentHeight.stopAnimation();
        groupAnimations.push(Animated.timing(group.currentHeight, {
          duration: BAR_ANIMATION_DURATION_MS,
          easing: BAR_ANIMATION_EASING,
          toValue: group.currentTargetHeight,
          useNativeDriver: false
        }));
      }

      if (group.otherHeight) {
        group.otherHeight.stopAnimation();
        groupAnimations.push(Animated.timing(group.otherHeight, {
          duration: BAR_ANIMATION_DURATION_MS,
          easing: BAR_ANIMATION_EASING,
          toValue: group.otherTargetHeight,
          useNativeDriver: false
        }));
      }

      if (groupAnimations.length === 0) {
        return [];
      }

      return Animated.sequence([
        Animated.delay(group.animationDelayMs),
        Animated.parallel(groupAnimations)
      ]);
    });

    if (animations.length === 0) {
      pruneAnimatedBarValues(nextGroups, barHeightValues);
      return;
    }

    Animated.parallel(animations).start(({ finished }) => {
      if (!finished || barAnimationSequence.current !== sequence) {
        return;
      }

      const activeGroups = barGroupsRef.current.filter((group) => targetDates.has(group.date));
      pruneAnimatedBarValues(activeGroups, barHeightValues);

      barGroupsRef.current = activeGroups;
      setAnimatedBarGroups(activeGroups);
    });

    return () => {
      if (barAnimationSequence.current === sequence) {
        barAnimationSequence.current += 1;
      }
      const activeGroups = barGroupsRef.current.filter((group) => targetDates.has(group.date));
      pruneAnimatedBarValues(activeGroups, barHeightValues);
      barGroupsRef.current = activeGroups;
    };
  }, [barTargetGroups]);

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
      onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}
      onPress={handleChartPress}
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

        {animatedBarGroups.map((group) => {
          return (
            <Fragment key={group.date}>
              {group.currentHeight ? (
                <AnimatedRect
                  fill={currentUserColor}
                  height={group.currentHeight}
                  rx={3}
                  width={group.barWidth}
                  x={group.x - group.barWidth / 2}
                  y={Animated.subtract(baseline, group.currentHeight)}
                />
              ) : null}
              {group.otherHeight ? (
                <AnimatedRect
                  fill={otherUserColor}
                  height={group.otherHeight}
                  rx={3}
                  width={group.barWidth}
                  x={group.x - group.barWidth / 2}
                  y={Animated.subtract(
                    baseline,
                    group.currentHeight
                      ? Animated.add(group.currentHeight, group.otherHeight)
                      : group.otherHeight
                  )}
                />
              ) : null}
            </Fragment>
          );
        })}

        {selectedPoint && tooltip ? (
          <>
            <Circle cx={selectedPoint.x} cy={selectedPoint.topY} fill={colors.surface} r={7} stroke="rgba(15,118,110,0.26)" strokeWidth={4} />
            <Circle cx={selectedPoint.x} cy={selectedPoint.topY} fill={colors.surface} r={3} stroke={currentUserColor} strokeWidth={2} />
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

function animatedBarValue(
  key: string,
  targetHeight: number,
  shouldAnimate: boolean,
  values: Map<string, Animated.Value>
) {
  const existingValue = values.get(key);
  if (existingValue) {
    return existingValue;
  }

  const nextValue = new Animated.Value(shouldAnimate ? 0 : targetHeight);
  values.set(key, nextValue);
  return nextValue;
}

function pruneAnimatedBarValues(groups: AnimatedBarGroup[], values: Map<string, Animated.Value>) {
  const activeKeys = new Set(groups.flatMap((group) => [
    group.currentKey,
    group.otherKey
  ]).filter((key): key is string => Boolean(key)));

  for (const key of values.keys()) {
    if (!activeKeys.has(key)) {
      values.delete(key);
    }
  }
}

function barKey(date: string, userId: string) {
  return `${date}:${userId}`;
}

function visualBarHeight(height: number) {
  return height > 0 ? Math.max(height, 2) : 0;
}

function barColumnDelay(index: number, count: number) {
  if (count <= 1) {
    return 0;
  }

  return index * Math.min(BAR_COLUMN_STAGGER_MS, BAR_STAGGER_BUDGET_MS / (count - 1));
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
