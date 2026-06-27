import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedBarFill, AnimatedPercentFill } from '@/src/components/motion';
import { colors, fontFamilies, theme } from '@/src/components/styles';
import { IconButton } from '@/src/components/ui';
import { displayName, formatYen } from '@/src/lib/format';
import { getSpendComparisonPresentation } from '@/src/lib/spendComparison';
import type {
  CategoryDetailBreakdownItem,
  CategoryDetailDailyStat,
  CategoryDetailMemberSplit,
  CategoryDetailStat
} from '@/src/lib/stats';
import type { LedgerMemberProfile } from '@/src/types/database';

type CategoryDetailSheetProps = {
  detail: CategoryDetailStat | null;
  members: LedgerMemberProfile[];
  onClose: () => void;
};

type BlurFallbackBoundaryProps = {
  children: ReactNode;
};

type BlurFallbackBoundaryState = {
  failed: boolean;
};

const ENTER_DURATION_MS = 180;
const EXIT_DURATION_MS = 130;
const DISMISS_DRAG_DISTANCE = 70;
const SHEET_HEIGHT_RATIO = 0.72;

export function CategoryDetailSheet({ detail, members, onClose }: CategoryDetailSheetProps) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const [renderedDetail, setRenderedDetail] = useState<CategoryDetailStat | null>(detail);
  const [closing, setClosing] = useState(false);
  const [transitionProgress] = useState(() => new Animated.Value(0));
  const [dragY] = useState(() => new Animated.Value(0));
  const [sheetAtTop, setSheetAtTop] = useState(true);
  const memberNameById = useMemo(() => (
    new Map(members.map((member) => [member.user_id, displayName(member.profile.display_name)]))
  ), [members]);
  const sheetWidth = width;
  const sheetMaxHeight = Math.max(300, Math.min(height * SHEET_HEIGHT_RATIO, height - insets.top - 12));
  const visible = Boolean(detail);
  const springDragBack = useMemo(() => () => {
    Animated.spring(dragY, {
      damping: 18,
      mass: 0.7,
      stiffness: 180,
      toValue: 0,
      useNativeDriver: true
    }).start();
  }, [dragY]);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) => (
      sheetAtTop &&
      gestureState.dy > 8 &&
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.25
    ),
    onPanResponderMove: (_, gestureState) => {
      dragY.setValue(Math.max(0, gestureState.dy));
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > DISMISS_DRAG_DISTANCE) {
        dragY.setValue(0);
        onClose();
        return;
      }

      springDragBack();
    },
    onPanResponderTerminate: () => {
      springDragBack();
    },
    onStartShouldSetPanResponder: () => false
  }), [dragY, onClose, sheetAtTop, springDragBack]);
  const handlePanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) => (
      gestureState.dy > 4 &&
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
    ),
    onPanResponderMove: (_, gestureState) => {
      dragY.setValue(Math.max(0, gestureState.dy));
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > DISMISS_DRAG_DISTANCE) {
        dragY.setValue(0);
        onClose();
        return;
      }

      springDragBack();
    },
    onPanResponderTerminate: () => {
      springDragBack();
    },
    onStartShouldSetPanResponder: () => false
  }), [dragY, onClose, springDragBack]);

  useEffect(() => {
    if (!detail) {
      return;
    }

    setRenderedDetail(detail);
    setClosing(false);
    dragY.setValue(0);
    setSheetAtTop(true);
    transitionProgress.setValue(0);
    Animated.timing(transitionProgress, {
      duration: ENTER_DURATION_MS,
      toValue: 1,
      useNativeDriver: true
    }).start();
  }, [detail, dragY, transitionProgress]);

  useEffect(() => {
    if (visible || !renderedDetail || closing) {
      return;
    }

    setClosing(true);
    transitionProgress.stopAnimation();
    Animated.timing(transitionProgress, {
      duration: EXIT_DURATION_MS,
      toValue: 0,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (!finished) {
        setClosing(false);
        return;
      }

      setRenderedDetail(null);
      setClosing(false);
    });
  }, [closing, renderedDetail, transitionProgress, visible]);

  if (!renderedDetail) {
    return null;
  }

  const comparison = getSpendComparisonPresentation(renderedDetail.comparison.direction);
  const comparisonBadgeText = formatComparisonBadge(renderedDetail.comparison.percentage, comparison.symbol);
  const maxBreakdownAmount = Math.max(0, ...renderedDetail.breakdown.map((item) => item.amountYen));
  const splitTotal = renderedDetail.memberSplits.reduce((sum, split) => sum + split.amountYen, 0);
  const dragHandlers = Platform.OS === 'web' ? {} : panResponder.panHandlers;
  const handleDragHandlers = Platform.OS === 'web' ? {} : handlePanResponder.panHandlers;

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible>
      <Pressable
        onPress={onClose}
        style={sheetStyles.backdrop}
      >
        {Platform.OS === 'ios' ? (
          <BlurFallbackBoundary>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: transitionProgress }]}>
              <BlurView intensity={30} style={StyleSheet.absoluteFill} tint="light" />
            </Animated.View>
          </BlurFallbackBoundary>
        ) : null}
        <Animated.View
          pointerEvents="none"
          style={[
            sheetStyles.fallback,
            Platform.OS === 'ios' && sheetStyles.fallbackIos,
            { opacity: transitionProgress }
          ]}
        />

        <Pressable
          accessibilityLabel={`${renderedDetail.category} category details`}
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={[
            sheetStyles.sheetHitArea,
            {
              marginBottom: 0,
              maxHeight: sheetMaxHeight,
              width: sheetWidth
            }
          ]}
        >
          <Animated.View
            {...dragHandlers}
            style={[
              sheetStyles.sheet,
              {
                maxHeight: sheetMaxHeight,
                opacity: transitionProgress,
                transform: [
                  {
                    translateY: Animated.add(
                      transitionProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [height, 0]
                      }),
                      dragY
                    )
                  }
                ]
              }
            ]}
          >
            <Pressable
              accessibilityLabel="Drag down to close category details"
              hitSlop={{ bottom: 10, left: 48, right: 48, top: 10 }}
              style={sheetStyles.grabberHitArea}
              {...handleDragHandlers}
            >
              <View style={sheetStyles.grabber} />
            </Pressable>
            <View style={sheetStyles.closeButton}>
              <IconButton
                accessibilityLabel="Close category details"
                icon="close"
                onPress={onClose}
                size="sm"
                tone="neutral"
              />
            </View>

            <View style={sheetStyles.header}>
              <View style={[sheetStyles.iconBadge, { backgroundColor: tint(renderedDetail.color, '29') }]}>
                <Ionicons color={renderedDetail.color} name={renderedDetail.icon} size={22} />
              </View>
              <View style={sheetStyles.titleGroup}>
                <Text ellipsizeMode="tail" numberOfLines={1} style={sheetStyles.title}>
                  {renderedDetail.category}
                </Text>
                <Text style={sheetStyles.subtitle}>
                  {renderedDetail.shareOfTotal.toFixed(1)}% of all spend
                </Text>
              </View>
              <View style={sheetStyles.headerAmountGroup}>
                <Text adjustsFontSizeToFit numberOfLines={1} style={sheetStyles.headerAmount}>
                  {formatYen(renderedDetail.amountYen)}
                </Text>
                <View style={[sheetStyles.comparisonBadge, { backgroundColor: tint(comparison.color, '1F') }]}>
                  <Text style={[sheetStyles.comparisonBadgeText, { color: comparison.color }]}>
                    {comparisonBadgeText}
                  </Text>
                </View>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={[sheetStyles.content, { paddingBottom: 30 + insets.bottom }]}
              onScroll={(event) => {
                const nextAtTop = event.nativeEvent.contentOffset.y <= 0;
                setSheetAtTop((current) => (current === nextAtTop ? current : nextAtTop));
              }}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              style={sheetStyles.scroll}
            >
              <View style={sheetStyles.statStrip}>
                <Metric label="Avg / day" value={formatYen(renderedDetail.averagePerDayYen)} />
                <Metric label="Transactions" value={String(renderedDetail.transactions)} />
                <Metric
                  label="Top day"
                  value={renderedDetail.topDay.date ? formatYen(renderedDetail.topDay.amountYen) : '--'}
                />
              </View>

              <View style={sheetStyles.section}>
                <SectionHeader
                  title={renderedDetail.breakdownKind === 'category' ? 'By source category' : 'By subcategory'}
                />
                <View style={sheetStyles.breakdownList}>
                  {renderedDetail.breakdown.length > 0 ? (
                    renderedDetail.breakdown.map((item) => (
                      <BreakdownRow
                        color={renderedDetail.breakdownKind === 'category' ? item.color : renderedDetail.color}
                        item={item}
                        key={item.key}
                        maxAmountYen={maxBreakdownAmount}
                      />
                    ))
                  ) : (
                    <Text style={sheetStyles.emptyText}>No breakdown available</Text>
                  )}
                </View>
              </View>

              <DailySpendChart color={renderedDetail.color} daily={renderedDetail.daily} />

              {renderedDetail.memberSplits.length > 0 ? (
                <View style={sheetStyles.section}>
                  <SectionHeader title="Cost split · share owed" />
                  <View style={sheetStyles.splitTrack}>
                    {renderedDetail.memberSplits.map((split) => (
                      <View
                        key={split.userId}
                        style={[
                          sheetStyles.splitFill,
                          {
                            backgroundColor: split.color,
                            flex: splitTotal > 0 ? Math.max(0, split.amountYen) : 0
                          }
                        ]}
                      />
                    ))}
                  </View>
                  <View style={sheetStyles.memberList}>
                    {renderedDetail.memberSplits.map((split) => (
                      <MemberSplitHalf
                        key={split.userId}
                        name={memberNameById.get(split.userId) || 'Unnamed user'}
                        split={split}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </ScrollView>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Metric({
  label,
  value,
  valueNote
}: {
  label: string;
  value: string;
  valueNote?: string;
}) {
  return (
    <View style={sheetStyles.metric}>
      <Text ellipsizeMode="tail" numberOfLines={1} style={sheetStyles.metricLabel}>
        {label}
      </Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={sheetStyles.metricValue}>
        {value}
      </Text>
      {valueNote ? (
        <Text ellipsizeMode="tail" numberOfLines={1} style={sheetStyles.metricNote}>
          {valueNote}
        </Text>
      ) : null}
    </View>
  );
}

function SectionHeader({ caption, title }: { caption?: string; title: string }) {
  return (
    <View style={sheetStyles.sectionHeader}>
      <Text style={sheetStyles.sectionTitle}>{title}</Text>
      {caption ? <Text style={sheetStyles.sectionCaption}>{caption}</Text> : null}
    </View>
  );
}

function DailySpendChart({
  color,
  daily
}: {
  color: string;
  daily: CategoryDetailDailyStat[];
}) {
  const maxAmount = Math.max(0, ...daily.map((day) => day.amountYen));
  const visibleDays = daily.length > 31 ? daily.slice(-31) : daily;
  const axisTicks = [
    visibleDays[0]?.label || '',
    visibleDays[Math.max(0, Math.floor((visibleDays.length - 1) / 2))]?.label || '',
    visibleDays[Math.max(0, visibleDays.length - 1)]?.label || ''
  ];

  return (
    <View style={sheetStyles.section}>
      <SectionHeader title="Daily spend" />
      <View style={sheetStyles.barChart}>
        {visibleDays.map((day) => {
          const barHeight = maxAmount > 0 ? Math.max(3, Math.round((day.amountYen / maxAmount) * 72)) : 2;
          return (
            <View key={day.date} style={sheetStyles.barSlot}>
              <AnimatedBarFill
                axis="y"
                color={day.isPeak ? color : tint(color, '6B')}
                minSize={2}
                size={barHeight}
                style={sheetStyles.bar}
              />
            </View>
          );
        })}
      </View>
      <View style={sheetStyles.axisRow}>
        {axisTicks.map((label, index) => (
          <Text key={`${label}-${index}`} style={sheetStyles.axisTick}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function MemberSplitHalf({
  name,
  split
}: {
  name: string;
  split: CategoryDetailMemberSplit;
}) {
  return (
    <View style={sheetStyles.memberHalf}>
      <View style={[sheetStyles.memberPill, { backgroundColor: tint(split.color, '24') }]}>
        <View style={[sheetStyles.dot, { backgroundColor: split.color }]} />
        <Text ellipsizeMode="tail" numberOfLines={1} style={[sheetStyles.memberName, { color: split.color }]}>
          {name}
        </Text>
      </View>
      <Text style={[sheetStyles.memberAmount, { color: split.color }]}>
        {formatYen(split.amountYen)}
      </Text>
    </View>
  );
}

function BreakdownRow({
  color,
  item,
  maxAmountYen
}: {
  color: string;
  item: CategoryDetailBreakdownItem;
  maxAmountYen: number;
}) {
  const width = maxAmountYen > 0 ? Math.max(6, (item.amountYen / maxAmountYen) * 100) : 0;

  return (
    <View style={sheetStyles.breakdownRow}>
      <View style={sheetStyles.breakdownTopRow}>
        <View style={sheetStyles.breakdownNameGroup}>
          <View style={[sheetStyles.breakdownDot, { backgroundColor: color }]} />
          <Text ellipsizeMode="tail" numberOfLines={1} style={sheetStyles.breakdownLabel}>
            {item.label}
          </Text>
        </View>
        <Text style={sheetStyles.breakdownPercent}>{item.percentage.toFixed(0)}%</Text>
        <Text style={sheetStyles.breakdownAmount}>{formatYen(item.amountYen)}</Text>
      </View>
      <View style={sheetStyles.breakdownTrack}>
        <AnimatedPercentFill color={color} percent={width} style={sheetStyles.breakdownFill} />
      </View>
    </View>
  );
}

function formatComparisonBadge(percentage: number | null, symbol: string) {
  if (percentage === null) {
    return `${symbol} new`;
  }

  if (percentage === 0) {
    return '- 0.0%';
  }

  return `${symbol} ${Math.abs(percentage).toFixed(1)}%`;
}

function tint(color: string, alpha = '1F') {
  return `${color}${alpha}`;
}

class BlurFallbackBoundary extends Component<BlurFallbackBoundaryProps, BlurFallbackBoundaryState> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return null;
    }

    return this.props.children;
  }
}

const sheetStyles = StyleSheet.create({
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 15
  },
  axisTick: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 9.5,
    fontWeight: '600',
    lineHeight: 14,
    minWidth: 18,
    textAlign: 'center'
  },
  backdrop: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'flex-end',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  bar: {
    borderRadius: 4,
    width: '100%'
  },
  barChart: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 3,
    minHeight: 72
  },
  barSlot: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    minWidth: 3
  },
  breakdownAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    minWidth: 66,
    textAlign: 'right'
  },
  breakdownDot: {
    borderRadius: 4,
    height: 9,
    width: 9
  },
  breakdownFill: {
    borderRadius: theme.radii.pill,
    height: '100%'
  },
  breakdownLabel: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    minWidth: 0
  },
  breakdownList: {
    gap: 11
  },
  breakdownNameGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0
  },
  breakdownPercent: {
    color: colors.muted,
    fontFamily: fontFamilies.monoBold,
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 16,
    minWidth: 42,
    textAlign: 'right'
  },
  breakdownRow: {
    gap: 5
  },
  breakdownTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9
  },
  breakdownTrack: {
    backgroundColor: 'rgba(42,39,34,0.08)',
    borderRadius: theme.radii.pill,
    height: 7,
    overflow: 'hidden'
  },
  comparisonBadge: {
    alignSelf: 'flex-end',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3
  },
  comparisonBadgeText: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    top: 13,
    zIndex: 2
  },
  content: {
    gap: 16,
    paddingBottom: 20,
    paddingHorizontal: 20,
    paddingTop: 4
  },
  dot: {
    borderRadius: 5,
    height: 9,
    width: 9
  },
  emptyText: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20
  },
  fallback: {
    backgroundColor: 'rgba(42,39,34,0.34)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  fallbackIos: {
    backgroundColor: 'rgba(42,39,34,0.18)'
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: colors.line,
    borderRadius: theme.radii.pill,
    height: 5,
    width: 38
  },
  grabberHitArea: {
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    minHeight: 22,
    width: 136
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 13,
    paddingBottom: 12,
    paddingHorizontal: 20,
    paddingRight: 54,
    paddingTop: 12
  },
  headerAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 24,
    maxWidth: 132,
    textAlign: 'right'
  },
  headerAmountGroup: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 4
  },
  iconBadge: {
    alignItems: 'center',
    borderRadius: 14,
    height: 46,
    justifyContent: 'center',
    width: 46
  },
  memberHalf: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minWidth: 0
  },
  memberAmount: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    marginLeft: 'auto'
  },
  memberList: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  memberName: {
    flexShrink: 1,
    fontFamily: fontFamilies.monoBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    lineHeight: 14,
    minWidth: 0
  },
  memberPill: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 6,
    maxWidth: 96,
    minHeight: 24,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  metric: {
    backgroundColor: 'rgba(192,137,46,0.07)',
    borderColor: colors.line,
    borderRadius: 13,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    minWidth: 92,
    paddingHorizontal: 11,
    paddingVertical: 8
  },
  metricLabel: {
    color: colors.subtle,
    fontFamily: fontFamilies.extraBold,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    lineHeight: 13,
    textTransform: 'uppercase'
  },
  metricNote: {
    color: colors.muted,
    fontFamily: fontFamilies.semiBold,
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 14
  },
  metricValue: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  scroll: {
    flexShrink: 1
  },
  section: {
    gap: 10
  },
  sectionCaption: {
    color: colors.muted,
    fontFamily: fontFamilies.monoBold,
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 16
  },
  sectionHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8
  },
  sectionTitle: {
    color: '#7A6F60',
    flex: 1,
    fontFamily: fontFamilies.extraBold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    lineHeight: 15,
    textTransform: 'uppercase'
  },
  sheet: {
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    ...theme.glassShadow
  },
  sheetHitArea: {
    alignSelf: 'stretch'
  },
  splitFill: {
    height: '100%'
  },
  splitTrack: {
    backgroundColor: 'rgba(42,39,34,0.08)',
    borderRadius: 6,
    flexDirection: 'row',
    gap: 2,
    height: 10,
    overflow: 'hidden'
  },
  statStrip: {
    flexDirection: 'row',
    gap: 8
  },
  subtitle: {
    color: colors.muted,
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 21
  },
  titleGroup: {
    flex: 1,
    minWidth: 0
  }
});
