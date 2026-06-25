import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from 'react-native';

import { DashboardModule } from '@/src/components/DashboardModule';
import { colors, fontFamilies } from '@/src/components/styles';
import { formatYen } from '@/src/lib/format';
import { heatLevelForAmount, type HeatDay } from '@/src/lib/stats';

type DashboardDailyActivityProps = {
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

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const POPOVER_WIDTH = 252;
const POPOVER_ESTIMATED_HEIGHT = 258;
const POPOVER_GAP = 9;
const SCREEN_MARGIN = 8;
const CARD_CLAMP_INSET = 6;
const HEAT_COLORS = [
  'rgba(42,39,34,0.05)',
  'rgba(192,137,46,0.20)',
  'rgba(192,137,46,0.42)',
  'rgba(176,122,30,0.70)',
  '#8A5A12'
] as const;
const HEAT_TEXT_COLORS = ['#C7BDAE', '#8A7A55', '#6B5A30', '#FFFDF7', '#FFFDF7'] as const;
const STRIP_GAP = 5;
const STRIP_TARGET_CELL_WIDTH = 30;
const STRIP_MIN_CELL_WIDTH = 28;

export function DashboardDailyActivity({
  days,
  monthKey,
  onViewHistoryDate,
  todayString
}: DashboardDailyActivityProps) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const stripRef = useRef<ScrollView | null>(null);
  const stripSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stripProgrammaticSettle = useRef(false);
  const cardRef = useRef<View | null>(null);
  const cellRefs = useRef<Record<string, View | null>>({});
  const [open, setOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<HeatDay | null>(null);
  const [selectedCellRect, setSelectedCellRect] = useState<Rect | null>(null);
  const [cardRect, setCardRect] = useState<Rect | null>(null);
  const [popoverHeight, setPopoverHeight] = useState(POPOVER_ESTIMATED_HEIGHT);
  const [stripViewportWidth, setStripViewportWidth] = useState(0);
  const todayMonthKey = todayString.slice(0, 7);
  const isSelectedMonthCurrent = monthKey === todayMonthKey;
  const maxAmount = useMemo(
    () => Math.max(0, ...days.filter((day) => !isFutureDay(day.date, monthKey, todayString)).map((day) => day.amount)),
    [days, monthKey, todayString]
  );
  const peakDay = useMemo(
    () => days
      .filter((day) => !isFutureDay(day.date, monthKey, todayString))
      .reduce<HeatDay | null>((peak, day) => (
        !peak || day.amount > peak.amount ? day : peak
      ), null),
    [days, monthKey, todayString]
  );
  const gridRows = useMemo(() => buildMonthGrid(days, monthKey), [days, monthKey]);
  const stripMetrics = useMemo(() => {
    if (stripViewportWidth <= 0) {
      return {
        cellWidth: STRIP_TARGET_CELL_WIDTH,
        snapInterval: STRIP_TARGET_CELL_WIDTH + STRIP_GAP
      };
    }

    const visibleCount = Math.max(1, Math.floor((stripViewportWidth + STRIP_GAP) / (STRIP_MIN_CELL_WIDTH + STRIP_GAP)));
    const cellWidth = (stripViewportWidth - STRIP_GAP * Math.max(0, visibleCount - 1)) / visibleCount;
    return {
      cellWidth,
      snapInterval: cellWidth + STRIP_GAP
    };
  }, [stripViewportWidth]);
  const popoverPosition = selectedCellRect
    ? computePopoverPosition({
        cardRect,
        cellRect: selectedCellRect,
        popoverHeight,
        windowHeight,
        windowWidth
      })
    : null;
  const cardMeasurementProps = Platform.OS === 'web' ? {} : { collapsable: false };

  useEffect(() => {
    const timer = setTimeout(() => {
      stripRef.current?.scrollToEnd({ animated: false });
    }, 80);

    return () => clearTimeout(timer);
  }, [days, monthKey, stripMetrics.snapInterval]);

  useEffect(() => () => {
    if (stripSettleTimer.current) {
      clearTimeout(stripSettleTimer.current);
    }
  }, []);

  useEffect(() => {
    if (!selectedDay) {
      return;
    }

    const selectedDate = selectedDay.date;
    if (!days.some((day) => day.date === selectedDate)) {
      closePopover();
    }
  }, [days, selectedDay]);

  function openPopover(day: HeatDay) {
    if (selectedDay?.date === day.date) {
      closePopover();
      return;
    }

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

  function handleStripLayout(event: LayoutChangeEvent) {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth <= 0) {
      return;
    }

    setStripViewportWidth((current) => Math.abs(current - nextWidth) > 1 ? nextWidth : current);
  }

  function settleStrip(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (stripProgrammaticSettle.current) {
      stripProgrammaticSettle.current = false;
      return;
    }

    const interval = stripMetrics.snapInterval;
    if (interval <= 0) {
      return;
    }

    const rawOffset = event.nativeEvent.contentOffset.x;
    const nextOffset = Math.max(0, Math.round(rawOffset / interval) * interval);
    if (Math.abs(nextOffset - rawOffset) > 0.5) {
      if (stripSettleTimer.current) {
        clearTimeout(stripSettleTimer.current);
      }
      stripSettleTimer.current = setTimeout(() => {
        stripProgrammaticSettle.current = true;
        stripRef.current?.scrollTo({ animated: true, x: nextOffset });
        stripSettleTimer.current = null;
      }, 140);
    }
  }

  function settleStripAfterDrag(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const velocityX = event.nativeEvent.velocity?.x || 0;
    if (Math.abs(velocityX) > 0.05) {
      return;
    }

    settleStrip(event);
  }

  return (
    <>
      <DashboardModule
        detail={
          <View ref={cardRef} {...cardMeasurementProps} style={localStyles.detail}>
            <View style={localStyles.weekdayHeader}>
              {WEEKDAY_LABELS.map((label, index) => (
                <Text key={`${label}-${index}`} style={localStyles.weekdayText}>{label}</Text>
              ))}
            </View>

            <View style={localStyles.grid}>
              {gridRows.map((row, rowIndex) => (
                <View key={`row-${rowIndex}`} style={localStyles.gridRow}>
                  {row.map((day, columnIndex) => {
                    if (!day) {
                      return <View key={`empty-${rowIndex}-${columnIndex}`} style={localStyles.emptyCell} />;
                    }

                    const future = isSelectedMonthCurrent && day.date > todayString;
                    const selected = selectedDay?.date === day.date;
                    const level = heatLevelForAmount(day.amount, maxAmount);
                    const isPeak = peakDay?.date === day.date && (peakDay?.amount || 0) > 0;
                    const dayNumber = Number(day.date.slice(8, 10));

                    return (
                      <Pressable
                        accessibilityLabel={`${formatFullDay(day.date)} ${formatYen(day.amount)}`}
                        accessibilityRole="button"
                        disabled={future}
                        key={day.date}
                        onPress={() => openPopover(day)}
                        ref={(node) => {
                          cellRefs.current[day.date] = node;
                        }}
                        style={({ pressed }) => [
                          localStyles.cell,
                          {
                            backgroundColor: future ? 'transparent' : HEAT_COLORS[level],
                            borderColor: future ? 'rgba(42,39,34,0.16)' : 'transparent',
                            borderStyle: future ? 'dashed' : 'solid'
                          },
                          day.date === todayString && localStyles.todayCell,
                          selected && localStyles.selectedCell,
                          pressed && !future && localStyles.pressed
                        ]}
                      >
                        <Text style={[
                          localStyles.cellText,
                          { color: future ? colors.subtle : HEAT_TEXT_COLORS[level] },
                          future && localStyles.futureText
                        ]}>
                          {dayNumber}
                        </Text>
                        {isPeak ? (
                          <View style={[
                            localStyles.peakDot,
                            level >= 3 && localStyles.peakDotLight
                          ]} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        }
        footer={
          <View style={localStyles.stripFooter}>
            <Text style={localStyles.stripHint}>{formatMonthHint(monthKey)} · SWIPE</Text>
            <View style={localStyles.heatLegend}>
              <Text style={localStyles.scaleLabel}>less</Text>
              {HEAT_COLORS.slice(1).map((color) => (
                <View key={color} style={[localStyles.scaleDot, { backgroundColor: color }]} />
              ))}
              <Text style={localStyles.scaleLabel}>more</Text>
            </View>
          </View>
        }
        onToggle={() => setOpen((current) => !current)}
        open={open}
        summary={
          <View style={localStyles.summary}>
            <ScrollView
              horizontal
              onLayout={handleStripLayout}
              onMomentumScrollEnd={settleStrip}
              onScrollEndDrag={settleStripAfterDrag}
              ref={stripRef}
              showsHorizontalScrollIndicator={false}
              style={localStyles.stripViewport}
              contentContainerStyle={localStyles.stripContent}
            >
              {days.map((day) => {
                const future = isSelectedMonthCurrent && day.date > todayString;
                const level = heatLevelForAmount(day.amount, maxAmount);
                const dayNumber = Number(day.date.slice(8, 10));
                return (
                  <View
                    key={day.date}
                    style={[
                      localStyles.stripCell,
                      {
                        backgroundColor: future ? 'transparent' : HEAT_COLORS[level],
                        borderColor: future ? 'rgba(42,39,34,0.16)' : 'transparent',
                        borderStyle: future ? 'dashed' : 'solid'
                      },
                      { width: stripMetrics.cellWidth },
                      day.date === todayString && localStyles.todayCell
                    ]}
                  >
                    <Text style={[
                      localStyles.stripCellText,
                      { color: future ? colors.subtle : HEAT_TEXT_COLORS[level] },
                      future && localStyles.futureText
                    ]}>
                      {dayNumber}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        }
        summaryStat={
          <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.headerStat}>
            peak <Text style={localStyles.headerGold}>{peakDay && peakDay.amount > 0 ? formatPeakDay(peakDay.date) : '--'}</Text>
            {' · '}
            <Text style={localStyles.headerStrong}>{formatYen(peakDay?.amount || 0)}</Text>
          </Text>
        }
        title="Daily Activity"
      />

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
                        {member.label.toUpperCase()}
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

function buildMonthGrid(days: HeatDay[], monthKey: string) {
  const leadingEmptyCount = monthKey ? mondayFirstColumn(monthKey) : 0;
  const items: (HeatDay | null)[] = [
    ...Array.from({ length: leadingEmptyCount }, () => null),
    ...days
  ];
  const rows: (HeatDay | null)[][] = [];
  for (let index = 0; index < items.length; index += 7) {
    const row = items.slice(index, index + 7);
    rows.push(row.length < 7 ? [...row, ...Array.from({ length: 7 - row.length }, () => null)] : row);
  }
  return rows;
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
  return `${new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).toUpperCase()} ${date.getDate()}`;
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
  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(year, month - 1, 1)).toUpperCase();
}

const localStyles = StyleSheet.create({
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
  cell: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    position: 'relative'
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
  detail: {
    gap: 7,
    paddingBottom: 16,
    paddingHorizontal: 16
  },
  divider: {
    backgroundColor: colors.line,
    height: 1
  },
  emptyCell: {
    aspectRatio: 1,
    flex: 1
  },
  emptyText: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 12.5,
    lineHeight: 17
  },
  futureText: {
    opacity: 0.5
  },
  grid: {
    gap: 5
  },
  gridRow: {
    flexDirection: 'row',
    gap: 5
  },
  headerGold: {
    color: '#8A5A12',
    fontFamily: fontFamilies.monoBold,
    fontWeight: '700'
  },
  headerStat: {
    color: colors.subtle,
    fontFamily: fontFamilies.mono,
    fontSize: 10,
    lineHeight: 14,
    maxWidth: 168
  },
  headerStrong: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontWeight: '700'
  },
  heatLegend: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4
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
    fontFamily: fontFamilies.monoBold,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 13
  },
  memberSplit: {
    flexDirection: 'row',
    gap: 14
  },
  memberTextBlock: {
    flex: 1,
    minWidth: 0
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
  selectedCell: {
    opacity: 0.86
  },
  stripCell: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: STRIP_TARGET_CELL_WIDTH
  },
  stripCellText: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14
  },
  stripContent: {
    gap: STRIP_GAP,
    paddingVertical: 3
  },
  stripFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 16,
    paddingHorizontal: 16
  },
  stripHint: {
    color: colors.subtle,
    fontFamily: fontFamilies.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    lineHeight: 12
  },
  stripViewport: {
    marginHorizontal: 16,
    overflow: 'hidden'
  },
  summary: {
    paddingBottom: 8,
    paddingTop: 8
  },
  todayCell: {
    boxShadow: '0 0 0 2px #C0892E'
  },
  weekdayHeader: {
    flexDirection: 'row',
    gap: 5
  },
  weekdayText: {
    color: colors.subtle,
    flex: 1,
    fontFamily: fontFamilies.monoBold,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 13,
    textAlign: 'center'
  }
});
