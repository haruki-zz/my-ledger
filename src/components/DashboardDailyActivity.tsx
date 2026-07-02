import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming
} from 'react-native-reanimated';

import { AnimatedChevron, motionCardResizeTransition } from '@/src/components/motion';
import { colors, fontFamilies, theme } from '@/src/components/styles';
import { formatYen } from '@/src/lib/format';
import { motionDuration, motionDurations, motionEasings, useReduceMotion } from '@/src/lib/motion';
import { heatLevelForAmount, heatScaleMaxForAmounts, trendVisualRatioForAmount, type HeatDay } from '@/src/lib/stats';

type DashboardDailyActivityProps = {
  barAnimationDurationMs?: number;
  days: HeatDay[];
  monthKey: string;
  onViewHistoryDate: (date: string) => void;
  todayString: string;
};

type Rect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type PopoverPosition = {
  caretLeft: number;
  flip: boolean;
  left: number;
  top: number;
};

type MorphDay = {
  barHeight: number;
  color: string;
  date: string;
  day: HeatDay;
  dayNumber: number;
  future: boolean;
  index: number;
  isToday: boolean;
  level: number;
};

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const POPOVER_WIDTH = 252;
const POPOVER_ESTIMATED_HEIGHT = 258;
const POPOVER_GAP = 9;
const SCREEN_MARGIN = 8;
const CARD_CLAMP_INSET = 6;
const HEAT_COLORS = [
  'rgba(42,39,34,0.05)',
  'rgba(192,137,46,0.16)',
  'rgba(192,137,46,0.32)',
  'rgba(192,137,46,0.50)',
  'rgba(176,122,30,0.72)',
  '#8A5A12'
] as const;
const HEAT_TEXT_COLORS = ['#C7BDAE', '#8A7A55', '#78683D', '#624E22', '#FFFDF7', '#FFFDF7'] as const;
const HEAT_ACTIVE_LEVELS = HEAT_COLORS.length - 1;
const BAR_MAX_HEIGHT = 40;
const COLLAPSED_BODY_HEIGHT = 88;
const WEEKDAY_HEADER_HEIGHT = 20;
const GRID_GAP = 5;
const BODY_HORIZONTAL_PADDING = 16;

export function DashboardDailyActivity({
  barAnimationDurationMs = 900,
  days,
  monthKey,
  onViewHistoryDate,
  todayString
}: DashboardDailyActivityProps) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const layout = motionCardResizeTransition(reduceMotion);
  const cardRef = useRef<View | null>(null);
  const cellRefs = useRef<Record<string, View | null>>({});
  const [open, setOpen] = useState(false);
  const [bodyWidth, setBodyWidth] = useState(0);
  const [selectedDay, setSelectedDay] = useState<HeatDay | null>(null);
  const [selectedCellRect, setSelectedCellRect] = useState<Rect | null>(null);
  const [cardRect, setCardRect] = useState<Rect | null>(null);
  const [popoverHeight, setPopoverHeight] = useState(POPOVER_ESTIMATED_HEIGHT);
  const todayMonthKey = todayString.slice(0, 7);
  const isSelectedMonthCurrent = monthKey === todayMonthKey;
  const visibleDays = useMemo(
    () => days.filter((day) => !isFutureDay(day.date, monthKey, todayString)),
    [days, monthKey, todayString]
  );
  const heatScaleMaxAmount = useMemo(
    () => heatScaleMaxForAmounts(visibleDays.map((day) => day.amount)),
    [visibleDays]
  );
  const peakDay = useMemo(
    () => visibleDays
      .reduce<HeatDay | null>((peak, day) => (
        !peak || day.amount > peak.amount ? day : peak
      ), null),
    [visibleDays]
  );
  const leadingEmptyCount = useMemo(() => mondayFirstColumn(monthKey), [monthKey]);
  const rowCount = Math.max(1, Math.ceil((leadingEmptyCount + days.length) / 7));
  const cellSize = bodyWidth > 0 ? (bodyWidth - GRID_GAP * 6) / 7 : 0;
  const gridHeight = WEEKDAY_HEADER_HEIGHT + rowCount * cellSize + Math.max(0, rowCount - 1) * GRID_GAP;
  const bodyHeight = open ? gridHeight + 44 : COLLAPSED_BODY_HEIGHT;
  const cardMeasurementProps = Platform.OS === 'web' ? {} : { collapsable: false };
  const popoverPosition = selectedCellRect
    ? computePopoverPosition({
        cardRect,
        cellRect: selectedCellRect,
        popoverHeight,
        windowHeight,
        windowWidth
      })
    : null;
  const morphDays = useMemo<MorphDay[]>(() => days.map((day, index) => {
    const future = isSelectedMonthCurrent && day.date > todayString;
    const level = heatLevelForAmount(day.amount, heatScaleMaxAmount, HEAT_ACTIVE_LEVELS);
    const ratio = heatScaleMaxAmount > 0 ? trendVisualRatioForAmount(day.amount, heatScaleMaxAmount) : 0;
    return {
      barHeight: Math.max(2, Math.round(ratio * BAR_MAX_HEIGHT)),
      color: future ? 'rgba(42,39,34,0.05)' : HEAT_COLORS[level],
      date: day.date,
      day,
      dayNumber: Number(day.date.slice(8, 10)),
      future,
      index,
      isToday: day.date === todayString,
      level
    };
  }), [days, heatScaleMaxAmount, isSelectedMonthCurrent, todayString]);

  function openPopover(day: HeatDay) {
    const cell = cellRefs.current[day.date];
    if (!cell) {
      return;
    }

    cell.measureInWindow((x, y, width, height) => {
      cardRef.current?.measureInWindow((cardX, cardY, cardWidth, cardHeight) => {
        setCardRect({ height: cardHeight, width: cardWidth, x: cardX, y: cardY });
        setSelectedCellRect({ height, width, x, y });
        setSelectedDay(day);
      });
    });
  }

  function closePopover() {
    setSelectedDay(null);
    setSelectedCellRect(null);
    setCardRect(null);
  }

  function handlePopoverLayout(event: LayoutChangeEvent) {
    const nextHeight = event.nativeEvent.layout.height;
    if (Math.abs(nextHeight - popoverHeight) > 1) {
      setPopoverHeight(nextHeight);
    }
  }

  function viewHistoryDate() {
    if (!selectedDay) {
      return;
    }

    onViewHistoryDate(selectedDay.date);
    closePopover();
  }

  function handleModuleToggle() {
    if (open) {
      closePopover();
    }

    setOpen((current) => !current);
  }

  return (
    <>
      <Animated.View ref={cardRef} {...cardMeasurementProps} layout={layout} style={localStyles.card}>
        <Pressable
          accessibilityLabel={`${open ? 'Collapse' : 'Expand'} Daily Activity`}
          accessibilityRole="button"
          onPress={handleModuleToggle}
          style={({ pressed }) => [localStyles.header, pressed && localStyles.headerPressed]}
        >
          <View style={localStyles.headerLeft}>
            <View style={localStyles.tick} />
            <Text style={localStyles.title}>Daily Activity</Text>
          </View>
          <AnimatedChevron open={open} />
        </Pressable>

        <Animated.View
          layout={layout}
          onLayout={(event) => setBodyWidth(Math.max(0, event.nativeEvent.layout.width - BODY_HORIZONTAL_PADDING * 2))}
          style={[localStyles.body, { height: bodyHeight }]}
        >
          {bodyWidth > 0 ? (
            <>
              <WeekdayHeader cellSize={cellSize} open={open} />
              <View style={[localStyles.morphStage, { height: open ? gridHeight || BAR_MAX_HEIGHT : BAR_MAX_HEIGHT }]}>
                {morphDays.map((item) => {
                  const isPeak = peakDay?.date === item.date && (peakDay?.amount || 0) > 0;
                  return (
                    <MorphDayCell
                      barAnimationDurationMs={barAnimationDurationMs}
                      cellSize={cellSize}
                      day={item}
                      key={`morph-day-${item.index}`}
                      leadingEmptyCount={leadingEmptyCount}
                      onPress={() => {
                        if (!open) {
                          setOpen(true);
                          return;
                        }
                        if (!item.future) {
                          openPopover(item.day);
                        }
                      }}
                      open={open}
                      peak={isPeak}
                      refCallback={(node) => {
                        cellRefs.current[item.date] = node;
                      }}
                      totalDays={days.length}
                    />
                  );
                })}
              </View>
              <View style={localStyles.summaryCaption}>
                <Text style={localStyles.summaryCaptionText}>{formatMonthHint(monthKey)}</Text>
                <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.summaryCaptionText}>
                  peak <Text style={localStyles.summaryCaptionStrong}>
                    {peakDay && peakDay.amount > 0 ? formatPeakDay(peakDay.date) : '--'}
                  </Text>
                  {' · '}
                  <Text style={localStyles.summaryCaptionStrong}>{formatYen(peakDay?.amount || 0)}</Text>
                </Text>
              </View>
            </>
          ) : null}
        </Animated.View>

        <View style={localStyles.stripFooter}>
          <Text style={localStyles.scaleLabel}>less</Text>
          {HEAT_COLORS.slice(1).map((color) => (
            <View key={color} style={[localStyles.scaleDot, { backgroundColor: color }]} />
          ))}
          <Text style={localStyles.scaleLabel}>more</Text>
        </View>
      </Animated.View>

      <Modal
        animationType="fade"
        onRequestClose={closePopover}
        transparent
        visible={Boolean(selectedDay && popoverPosition)}
      >
        <Pressable style={localStyles.scrim} onPress={closePopover}>
          {selectedDay && popoverPosition ? (
            <Pressable
              onLayout={handlePopoverLayout}
              onPress={(event) => event.stopPropagation()}
              style={[
                localStyles.popover,
                {
                  left: popoverPosition.left,
                  top: popoverPosition.top
                }
              ]}
            >
              <View style={[
                localStyles.caret,
                popoverPosition.flip && localStyles.caretFlip,
                { left: popoverPosition.caretLeft }
              ]} />
              <View style={localStyles.popoverTop}>
                <View style={localStyles.popoverHeading}>
                  <Text style={localStyles.popoverDate}>{formatPopoverDate(selectedDay.date)}</Text>
                  <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.popoverAmount}>
                    {formatYen(selectedDay.amount)}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Close daily activity details"
                  accessibilityRole="button"
                  onPress={closePopover}
                  style={({ pressed }) => [localStyles.closeButton, pressed && localStyles.pressed]}
                >
                  <Ionicons color={colors.ink} name="close" size={18} />
                </Pressable>
              </View>

              <View style={localStyles.categoryList}>
                {selectedDay.byCategory.length > 0 ? selectedDay.byCategory.map((category) => (
                  <View key={category.id} style={localStyles.categoryRow}>
                    <View style={[localStyles.categorySwatch, { backgroundColor: category.color }]} />
                    <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.categoryName}>
                      {category.label}
                    </Text>
                    <Text style={localStyles.categoryAmount}>{formatYen(category.amount)}</Text>
                  </View>
                )) : (
                  <Text style={localStyles.emptyText}>No spend this day.</Text>
                )}
              </View>

              <View style={localStyles.divider} />

              <View style={localStyles.memberSplit}>
                {selectedDay.byMember.map((member) => (
                  <View key={member.id} style={localStyles.memberItem}>
                    <View style={[localStyles.memberDot, { backgroundColor: member.color }]} />
                    <View style={localStyles.memberTextBlock}>
                      <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.memberLabel}>
                        {member.label}
                      </Text>
                      <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.memberAmount}>
                        {formatYen(member.amount)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={viewHistoryDate}
                style={({ pressed }) => [localStyles.historyButton, pressed && localStyles.pressed]}
              >
                <Ionicons color="#8A5A12" name="receipt-outline" size={15} />
                <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.historyButtonText}>
                  View {selectedDay.count} expense{selectedDay.count === 1 ? '' : 's'} in History
                </Text>
                <Ionicons color="#8A5A12" name="arrow-forward" size={15} />
              </Pressable>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

function WeekdayHeader({ cellSize, open }: { cellSize: number; open: boolean }) {
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    opacity.value = withDelay(open ? 220 : 0, withTiming(open ? 1 : 0, {
      duration: motionDuration(motionDurations.content, reduceMotion),
      easing: motionEasings.standard
    }));
  }, [open, opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value
  }));

  return (
    <Animated.View pointerEvents="none" style={[localStyles.weekdayHeader, animatedStyle]}>
      {WEEKDAY_LABELS.map((label, index) => (
        <Text key={`${label}-${index}`} style={[localStyles.weekdayText, { width: cellSize }]}>
          {label}
        </Text>
      ))}
    </Animated.View>
  );
}

function MorphDayCell({
  barAnimationDurationMs,
  cellSize,
  day,
  leadingEmptyCount,
  onPress,
  open,
  peak,
  refCallback,
  totalDays
}: {
  barAnimationDurationMs: number;
  cellSize: number;
  day: MorphDay;
  leadingEmptyCount: number;
  onPress: () => void;
  open: boolean;
  peak: boolean;
  refCallback: (node: View | null) => void;
  totalDays: number;
}) {
  const reduceMotion = useReduceMotion();
  const row = Math.floor((leadingEmptyCount + day.index) / 7);
  const col = (leadingEmptyCount + day.index) % 7;
  const barGap = 2;
  const stageWidth = cellSize * 7 + GRID_GAP * 6;
  const barWidth = cellSize > 0 ? (stageWidth - barGap * Math.max(0, totalDays - 1)) / Math.max(1, totalDays) : 0;
  const collapsedX = day.index * (barWidth + barGap);
  const collapsedY = BAR_MAX_HEIGHT - day.barHeight;
  const expandedX = col * (cellSize + GRID_GAP);
  const expandedY = WEEKDAY_HEADER_HEIGHT + row * (cellSize + GRID_GAP);
  const x = useSharedValue(open ? expandedX : collapsedX);
  const y = useSharedValue(open ? expandedY : collapsedY);
  const width = useSharedValue(open ? cellSize : barWidth);
  const height = useSharedValue(open ? cellSize : day.barHeight);
  const radius = useSharedValue(open ? 7 : 2);
  const backgroundColor = useSharedValue(day.future && open ? 'rgba(255,255,255,0)' : day.color);
  const borderColor = useSharedValue(day.future && open ? 'rgba(42,39,34,0.16)' : 'rgba(42,39,34,0)');
  const labelOpacity = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    const delay = reduceMotion ? 0 : open ? day.index * 5 : Math.max(0, 28 - day.index) * 3;
    const targetBackgroundColor = day.future && open ? 'rgba(255,255,255,0)' : day.color;
    const targetBorderColor = day.future && open ? 'rgba(42,39,34,0.16)' : 'rgba(42,39,34,0)';
    const timing = {
      duration: motionDuration(barAnimationDurationMs, reduceMotion),
      easing: motionEasings.emphasize
    };
    backgroundColor.value = withDelay(delay, withTiming(targetBackgroundColor, timing));
    borderColor.value = withDelay(delay, withTiming(targetBorderColor, timing));
    x.value = withDelay(delay, withTiming(open ? expandedX : collapsedX, timing));
    y.value = withDelay(delay, withTiming(open ? expandedY : collapsedY, timing));
    width.value = withDelay(delay, withTiming(open ? cellSize : barWidth, timing));
    height.value = withDelay(delay, withTiming(open ? cellSize : day.barHeight, timing));
    radius.value = withDelay(delay, withTiming(open ? 7 : 2, timing));
    labelOpacity.value = withDelay(open ? 240 + delay : 0, withTiming(open ? 1 : 0, {
      duration: motionDuration(motionDurations.content, reduceMotion),
      easing: motionEasings.standard
    }));
  }, [
    barAnimationDurationMs,
    barWidth,
    backgroundColor,
    borderColor,
    cellSize,
    collapsedX,
    collapsedY,
    day.barHeight,
    day.color,
    day.future,
    day.index,
    expandedX,
    expandedY,
    height,
    labelOpacity,
    open,
    radius,
    reduceMotion,
    width,
    x,
    y
  ]);

  const shellStyle = useAnimatedStyle(() => ({
    backgroundColor: backgroundColor.value,
    borderColor: borderColor.value,
    borderRadius: radius.value,
    height: height.value,
    transform: [{ translateX: x.value }, { translateY: y.value }],
    width: width.value
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value
  }));

  return (
    <Animated.View
      style={[
        localStyles.morphDay,
        {
          borderStyle: day.future && open ? 'dashed' : 'solid'
        },
        day.isToday && open && localStyles.todayCell,
        shellStyle
      ]}
      testID={`daily-activity-summary-bar-${day.date}`}
    >
      <Pressable
        accessibilityLabel={`${formatFullDay(day.date)} ${formatYen(day.day.amount)}`}
        accessibilityRole="button"
        onPress={onPress}
        ref={(node) => refCallback(node as View | null)}
        style={({ pressed }) => [localStyles.morphPressable, pressed && localStyles.pressed]}
      >
        <Animated.Text
          style={[
            localStyles.cellText,
            { color: day.future ? colors.subtle : HEAT_TEXT_COLORS[day.level] },
            labelStyle
          ]}
        >
          {day.dayNumber}
        </Animated.Text>
        {peak ? <Animated.View style={[localStyles.peakDot, day.level >= 3 && localStyles.peakDotLight, labelStyle]} /> : null}
      </Pressable>
    </Animated.View>
  );
}

function computePopoverPosition(input: {
  cardRect: Rect | null;
  cellRect: Rect;
  popoverHeight: number;
  windowHeight: number;
  windowWidth: number;
}): PopoverPosition {
  const cellCenterX = input.cellRect.x + input.cellRect.width / 2;
  const clampMin = input.cardRect ? input.cardRect.x + CARD_CLAMP_INSET : SCREEN_MARGIN;
  const clampMax = input.cardRect
    ? input.cardRect.x + input.cardRect.width - POPOVER_WIDTH - CARD_CLAMP_INSET
    : input.windowWidth - POPOVER_WIDTH - SCREEN_MARGIN;
  const left = clamp(cellCenterX - POPOVER_WIDTH / 2, clampMin, Math.max(clampMin, clampMax));
  const shouldFlip = input.cellRect.y + input.cellRect.height + POPOVER_GAP + input.popoverHeight > input.windowHeight - SCREEN_MARGIN;
  const top = shouldFlip
    ? Math.max(SCREEN_MARGIN, input.cellRect.y - input.popoverHeight - POPOVER_GAP)
    : input.cellRect.y + input.cellRect.height + POPOVER_GAP;
  const caretLeft = clamp(cellCenterX - left - 6.5, 14, POPOVER_WIDTH - 28);

  return {
    caretLeft,
    flip: shouldFlip,
    left,
    top
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isFutureDay(date: string, monthKey: string, todayString: string) {
  return monthKey === todayString.slice(0, 7) && date > todayString;
}

function mondayFirstColumn(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const day = new Date(year, month - 1, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function parseDateString(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatPeakDay(dateString: string) {
  const date = parseDateString(dateString);
  return `${new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date)} ${date.getDate()}`;
}

function formatFullDay(dateString: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    weekday: 'long'
  }).format(parseDateString(dateString));
}

function formatPopoverDate(dateString: string) {
  const date = parseDateString(dateString);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).toUpperCase();
  const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date).toUpperCase();
  return `${weekday} · ${month} ${date.getDate()}`;
}

function formatMonthHint(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(year, month - 1, 1));
}

const localStyles = StyleSheet.create({
  body: {
    overflow: 'hidden',
    paddingHorizontal: 16
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: theme.radii.surface,
    boxShadow: '0 10px 24px -16px rgba(42,39,34,0.13)',
    overflow: 'hidden',
    position: 'relative'
  },
  caret: {
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    height: 13,
    position: 'absolute',
    top: -7,
    transform: [{ rotate: '45deg' }],
    width: 13
  },
  caretFlip: {
    bottom: -7,
    top: undefined,
    transform: [{ rotate: '225deg' }]
  },
  categoryAmount: {
    color: colors.muted,
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15
  },
  categoryList: {
    gap: 7
  },
  categoryName: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    minWidth: 0
  },
  categoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  categorySwatch: {
    borderRadius: 3,
    height: 9,
    width: 9
  },
  cellText: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 34
  },
  divider: {
    backgroundColor: colors.line,
    height: 1
  },
  emptyText: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 12.5,
    lineHeight: 17
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  headerLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 9,
    minWidth: 0
  },
  headerPressed: {
    backgroundColor: 'rgba(42,39,34,0.03)'
  },
  historyButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(192,137,46,0.14)',
    borderColor: 'rgba(192,137,46,0.22)',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  historyButtonText: {
    color: '#8A5A12',
    flexShrink: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 17
  },
  memberAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17
  },
  memberDot: {
    borderRadius: 4,
    height: 8,
    width: 8
  },
  memberItem: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minWidth: 0
  },
  memberLabel: {
    color: colors.subtle,
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14
  },
  memberSplit: {
    flexDirection: 'row',
    gap: 14
  },
  memberTextBlock: {
    flex: 1,
    minWidth: 0
  },
  morphDay: {
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'center',
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0
  },
  morphPressable: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    position: 'relative',
    width: '100%'
  },
  morphStage: {
    position: 'relative'
  },
  peakDot: {
    backgroundColor: colors.accent,
    borderRadius: 1.5,
    bottom: 3,
    height: 3,
    left: '50%',
    position: 'absolute',
    transform: [{ translateX: -1.5 }],
    width: 3
  },
  peakDotLight: {
    backgroundColor: 'rgba(255,255,255,0.85)'
  },
  popover: {
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderRadius: 16,
    borderWidth: 1,
    boxShadow: '0 16px 38px -10px rgba(42,39,34,0.40)',
    gap: 12,
    padding: 14,
    position: 'absolute',
    width: POPOVER_WIDTH,
    zIndex: 2
  },
  popoverAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 30
  },
  popoverDate: {
    color: '#9A6A12',
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    lineHeight: 15
  },
  popoverHeading: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  popoverTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10
  },
  pressed: {
    opacity: 0.72
  },
  scaleDot: {
    borderRadius: 2,
    height: 9,
    width: 9
  },
  scaleLabel: {
    color: colors.subtle,
    fontFamily: fontFamilies.mono,
    fontSize: 9,
    lineHeight: 12
  },
  scrim: {
    flex: 1
  },
  stripFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    paddingBottom: 16,
    paddingHorizontal: 16
  },
  summaryCaption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10
  },
  summaryCaptionStrong: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontWeight: '700'
  },
  summaryCaptionText: {
    color: colors.subtle,
    fontFamily: fontFamilies.mono,
    fontSize: 10,
    lineHeight: 14
  },
  tick: {
    backgroundColor: colors.accent,
    borderRadius: theme.radii.pill,
    height: 18,
    width: 6
  },
  title: {
    color: colors.muted,
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    lineHeight: 15,
    textTransform: 'uppercase'
  },
  todayCell: {
    boxShadow: '0 0 0 2px #C0892E'
  },
  weekdayHeader: {
    flexDirection: 'row',
    gap: GRID_GAP,
    height: WEEKDAY_HEADER_HEIGHT,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  weekdayText: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoBold,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center'
  }
});
