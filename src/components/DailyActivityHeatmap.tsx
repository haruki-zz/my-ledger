import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent
} from 'react-native';

import { BentoCard, IconButton } from '@/src/components/ui';
import { colors, fontFamilies } from '@/src/components/styles';
import { heatLevelForAmount, type HeatDay } from '@/src/lib/stats';
import { formatYen } from '@/src/lib/format';

type DailyActivityHeatmapProps = {
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
  'rgba(192,137,46,0.22)',
  'rgba(192,137,46,0.46)',
  'rgba(176,122,30,0.74)',
  '#8A5A12'
] as const;
const HEAT_TEXT_COLORS = ['#9A8F80', '#6B5A38', '#5A4A2A', '#FFFFFF', '#FFFFFF'] as const;

export function DailyActivityHeatmap({
  days,
  monthKey,
  onViewHistoryDate,
  todayString
}: DailyActivityHeatmapProps) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const cardRef = useRef<View | null>(null);
  const cellRefs = useRef<Record<string, View | null>>({});
  const [selectedDay, setSelectedDay] = useState<HeatDay | null>(null);
  const [selectedCellRect, setSelectedCellRect] = useState<Rect | null>(null);
  const [cardRect, setCardRect] = useState<Rect | null>(null);
  const [popoverHeight, setPopoverHeight] = useState(POPOVER_ESTIMATED_HEIGHT);
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
  const leadingEmptyCount = monthKey ? mondayFirstColumn(monthKey) : 0;
  const gridRows = useMemo(() => {
    const items: (HeatDay | null)[] = [
      ...Array.from({ length: leadingEmptyCount }, () => null),
      ...days
    ];
    const rows: (HeatDay | null)[][] = [];
    for (let index = 0; index < items.length; index += 7) {
      rows.push(items.slice(index, index + 7));
    }
    return rows.map((row) => row.length < 7 ? [...row, ...Array.from({ length: 7 - row.length }, () => null)] : row);
  }, [days, leadingEmptyCount]);
  const popoverPosition = selectedCellRect
    ? computePopoverPosition({
        cardRect,
        cellRect: selectedCellRect,
        popoverHeight,
        windowHeight,
        windowWidth
      })
    : null;

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

  return (
    <BentoCard style={localStyles.card}>
      <View ref={cardRef} collapsable={false} style={localStyles.cardInner}>
        <View style={localStyles.header}>
          <View style={localStyles.titleRow}>
            <Ionicons color={colors.primary} name="grid-outline" size={16} />
            <Text style={localStyles.title}>Daily Activity</Text>
          </View>
          <View style={localStyles.peakRow}>
            <Ionicons color="#9A6A12" name="flame-outline" size={13} />
            <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.peakText}>
              Peak <Text style={localStyles.peakDay}>{peakDay && peakDay.amount > 0 ? formatPeakDay(peakDay.date) : '--'}</Text>{' '}
              <Text style={localStyles.peakAmount}>{formatYen(peakDay?.amount || 0)}</Text>
            </Text>
          </View>
        </View>

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
                        borderColor: future ? 'rgba(42,39,34,0.12)' : 'transparent',
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
                <IconButton
                  accessibilityLabel="Close daily activity details"
                  icon="close"
                  onPress={closePopover}
                  size="sm"
                  tone="neutral"
                  variant="ghost"
                />
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
    </BentoCard>
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

const localStyles = StyleSheet.create({
  card: {
    borderRadius: 18,
    gap: 13,
    padding: 16
  },
  cardInner: {
    gap: 13
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
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14
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
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between'
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
  peakAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontWeight: '700'
  },
  peakDay: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontWeight: '700'
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
  peakRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 6,
    minWidth: 0
  },
  peakText: {
    color: colors.muted,
    flexShrink: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    minWidth: 0
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
    gap: 10,
    justifyContent: 'space-between'
  },
  pressed: {
    opacity: 0.76
  },
  scrim: {
    backgroundColor: 'rgba(42,39,34,0.10)',
    flex: 1
  },
  selectedCell: {
    borderColor: colors.primary,
    borderWidth: 2,
    zIndex: 2
  },
  title: {
    color: '#7A6F60',
    fontFamily: fontFamilies.bold,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 15,
    textTransform: 'uppercase'
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7
  },
  todayCell: {
    borderColor: colors.accent,
    borderWidth: 2
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
    letterSpacing: 0.5,
    lineHeight: 13,
    textAlign: 'center'
  }
});
