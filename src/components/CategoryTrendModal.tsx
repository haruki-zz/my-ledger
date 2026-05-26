import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { CategoryMonthlyTrendChart } from '@/src/components/CategoryMonthlyTrendChart';
import type { AnchorPoint } from '@/src/components/PieChart';
import { colors, styles } from '@/src/components/styles';
import { useCategoryTrend } from '@/src/hooks/useCategoryTrend';
import { currentMonthKey, formatMonthLabel, type CategoryStat, type DashboardRange } from '@/src/lib/stats';

type TrendMonths = 3 | 6 | 12;

type CategoryTrendModalProps = {
  visible: boolean;
  category: CategoryStat | null;
  ledgerId: string | null;
  endMonthKey: string;
  range: DashboardRange;
  currentUserId: string | null;
  otherUserId: string | null;
  dataVersion: number;
  anchorPoint?: AnchorPoint;
  onClose: () => void;
};

const TREND_RANGE_OPTIONS: { label: string; value: TrendMonths }[] = [
  { label: '过去3个月', value: 3 },
  { label: '过去半年', value: 6 },
  { label: '过去1年', value: 12 }
];

export function CategoryTrendModal({
  visible,
  category,
  ledgerId,
  endMonthKey,
  range,
  currentUserId,
  otherUserId,
  dataVersion,
  anchorPoint,
  onClose
}: CategoryTrendModalProps) {
  const { height, width } = useWindowDimensions();
  const [trendMonths, setTrendMonths] = useState<TrendMonths>(3);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rendered, setRendered] = useState(visible);
  const [displayCategory, setDisplayCategory] = useState<CategoryStat | null>(category);
  const [displayAnchorPoint, setDisplayAnchorPoint] = useState<AnchorPoint | undefined>(anchorPoint);
  const [transitionProgress] = useState(() => new Animated.Value(0));
  const selectedOption = TREND_RANGE_OPTIONS.find((option) => option.value === trendMonths) || TREND_RANGE_OPTIONS[0];
  const isCurrentMonthTrend = endMonthKey === currentMonthKey();
  const originOffset = useMemo(
    () => modalOriginOffset(displayAnchorPoint, width, height),
    [displayAnchorPoint, height, width]
  );
  const trend = useCategoryTrend({
    ledgerId,
    category: rendered ? displayCategory?.category || null : null,
    endMonthKey,
    months: trendMonths,
    range,
    currentUserId,
    otherUserId,
    dataVersion
  });

  useEffect(() => {
    if (!visible) {
      return;
    }

    transitionProgress.stopAnimation();
    setDisplayCategory(category);
    setDisplayAnchorPoint(anchorPoint);
    setTrendMonths(3);
    setMenuOpen(false);
    setRendered(true);
    transitionProgress.setValue(0);
    Animated.timing(transitionProgress, {
      duration: 260,
      toValue: 1,
      useNativeDriver: true
    }).start();
  }, [anchorPoint, category, transitionProgress, visible]);

  useEffect(() => {
    if (visible || !rendered) {
      return;
    }

    transitionProgress.stopAnimation();
    Animated.timing(transitionProgress, {
      duration: 200,
      toValue: 0,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) {
        setRendered(false);
        setDisplayCategory(null);
        setDisplayAnchorPoint(undefined);
      }
    });
  }, [rendered, transitionProgress, visible]);

  function selectTrendMonths(nextMonths: TrendMonths) {
    setTrendMonths(nextMonths);
    setMenuOpen(false);
  }

  const overlayAnimatedStyle = {
    opacity: transitionProgress
  };
  const panelAnimatedStyle = {
    opacity: transitionProgress,
    transform: [
      {
        translateX: transitionProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [originOffset.x, 0]
        })
      },
      {
        translateY: transitionProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [originOffset.y, 0]
        })
      },
      {
        scale: transitionProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.94, 1]
        })
      }
    ]
  };

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible={rendered}>
      <Animated.View style={[modalStyles.overlay, overlayAnimatedStyle]}>
        <Pressable onPress={onClose} style={modalStyles.backdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={modalStyles.panelHitArea}>
            <Animated.View style={[modalStyles.panel, panelAnimatedStyle]}>
              <View>
                <Text style={styles.h2}>{displayCategory?.category || '类别趋势'}</Text>
                <Text style={styles.muted}>截至 {formatMonthLabel(endMonthKey)}</Text>
                {isCurrentMonthTrend ? <Text style={styles.muted}>本月数据截至今天</Text> : null}
              </View>

              <View style={styles.dropdown}>
                <Text style={styles.label}>时间范围</Text>
                <Pressable
                  onPress={() => setMenuOpen((current) => !current)}
                  style={[styles.dropdownTrigger, menuOpen && styles.dropdownTriggerActive]}
                >
                  <Text style={styles.dropdownValue}>{selectedOption.label}</Text>
                  <Text style={styles.dropdownIndicator}>{menuOpen ? '⌃' : '⌄'}</Text>
                </Pressable>

                {menuOpen ? (
                  <View style={styles.dropdownMenu}>
                    {TREND_RANGE_OPTIONS.map((option) => {
                      const selected = option.value === trendMonths;
                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => selectTrendMonths(option.value)}
                          style={[styles.dropdownOption, selected && styles.dropdownOptionActive]}
                        >
                          <Text style={[styles.dropdownOptionText, selected && styles.dropdownOptionTextActive]}>
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              {trend.error ? <Text style={styles.error}>{trend.error}</Text> : null}

              <View>
                {trend.loading ? (
                  <View style={modalStyles.loading}>
                    <ActivityIndicator color={colors.primary} size="small" />
                    <Text style={styles.muted}>正在更新...</Text>
                  </View>
                ) : null}
                <View style={trend.loading ? modalStyles.chartRefreshing : null}>
                  <CategoryMonthlyTrendChart color={displayCategory?.color || colors.primary} series={trend.series} />
                </View>
              </View>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

function modalOriginOffset(anchorPoint: AnchorPoint | undefined, width: number, height: number) {
  if (!anchorPoint || width <= 0 || height <= 0) {
    return { x: 0, y: 12 };
  }

  const offsetX = ((anchorPoint.x - width / 2) / Math.max(width / 2, 1)) * 36;
  const offsetY = ((anchorPoint.y - height / 2) / Math.max(height / 2, 1)) * 44;

  return {
    x: clamp(offsetX, -36, 36),
    y: clamp(offsetY, -44, 44)
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(value, min));
}

const modalStyles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    width: '100%'
  },
  chartRefreshing: {
    opacity: 0.4
  },
  loading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8
  },
  overlay: {
    backgroundColor: 'rgba(23, 32, 42, 0.36)',
    flex: 1
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 16,
    maxWidth: 440,
    padding: 18,
    width: '100%'
  },
  panelHitArea: {
    maxWidth: 440,
    width: '100%'
  }
});
