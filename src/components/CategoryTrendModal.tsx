import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import {
  CategoryMonthlyTrendChart,
  type CategoryMonthlyTrendChartMode
} from '@/src/components/CategoryMonthlyTrendChart';
import type { AnchorPoint } from '@/src/components/PieChart';
import { colors, styles, theme } from '@/src/components/styles';
import { PillTabs } from '@/src/components/ui';
import { useCategoryTrend } from '@/src/hooks/useCategoryTrend';
import { clamp } from '@/src/lib/math';
import { currentMonthKey, formatMonthLabel, type CategoryStat, type DashboardRange } from '@/src/lib/stats';

type TrendMonths = '3' | '6' | '12';

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
  { label: '3M', value: '3' },
  { label: '6M', value: '6' },
  { label: '12M', value: '12' }
];

const TREND_MODE_OPTIONS: { label: string; value: CategoryMonthlyTrendChartMode }[] = [
  { label: 'Curve', value: 'curve' },
  { label: 'Bar', value: 'bar' }
];

const TREND_MONTH_COUNTS: Record<TrendMonths, 3 | 6 | 12> = {
  3: 3,
  6: 6,
  12: 12
};

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
  const [trendMonths, setTrendMonths] = useState<TrendMonths>('3');
  const [trendChartMode, setTrendChartMode] = useState<CategoryMonthlyTrendChartMode>('bar');
  const [rendered, setRendered] = useState(visible);
  const [displayCategory, setDisplayCategory] = useState<CategoryStat | null>(category);
  const [displayAnchorPoint, setDisplayAnchorPoint] = useState<AnchorPoint | undefined>(anchorPoint);
  const [transitionProgress] = useState(() => new Animated.Value(0));
  const isCurrentMonthTrend = endMonthKey === currentMonthKey();
  const originOffset = useMemo(
    () => modalOriginOffset(displayAnchorPoint, width, height),
    [displayAnchorPoint, height, width]
  );
  const trend = useCategoryTrend({
    ledgerId,
    category: rendered ? displayCategory?.category || null : null,
    categoryNames: rendered ? displayCategory?.sourceCategories : undefined,
    endMonthKey,
    months: TREND_MONTH_COUNTS[trendMonths],
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
    setTrendMonths('3');
    setTrendChartMode('bar');
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
                <Text style={styles.h2}>{displayCategory?.category || 'Category Trend'}</Text>
                <Text style={styles.muted}>Through {formatMonthLabel(endMonthKey)}</Text>
                {isCurrentMonthTrend ? <Text style={styles.muted}>Current month data is through today</Text> : null}
              </View>

              <View style={modalStyles.controls}>
                <View style={modalStyles.controlGroup}>
                  <Text style={styles.label}>Time Range</Text>
                  <PillTabs
                    accessibilityLabel="Trend time range"
                    onChange={setTrendMonths}
                    options={TREND_RANGE_OPTIONS}
                    style={modalStyles.rangePillTrack}
                    value={trendMonths}
                  />
                </View>

                <View style={modalStyles.controlGroup}>
                  <Text style={styles.label}>Chart</Text>
                  <PillTabs
                    accessibilityLabel="Trend chart type"
                    onChange={setTrendChartMode}
                    options={TREND_MODE_OPTIONS}
                    style={modalStyles.modePillTrack}
                    value={trendChartMode}
                  />
                </View>
              </View>

              {trend.error ? <Text style={styles.error}>{trend.error}</Text> : null}

              <View>
                {trend.loading ? (
                  <View style={modalStyles.loading}>
                    <ActivityIndicator color={colors.primary} size="small" />
                    <Text style={styles.muted}>Updating...</Text>
                  </View>
                ) : null}
                <View style={trend.loading ? modalStyles.chartRefreshing : null}>
                  <CategoryMonthlyTrendChart
                    color={displayCategory?.color || colors.primary}
                    mode={trendChartMode}
                    series={trend.series}
                  />
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
  controlGroup: {
    flex: 1,
    gap: 8,
    minWidth: 150
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  loading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8
  },
  modePillTrack: {
    minWidth: 132,
  },
  overlay: {
    backgroundColor: 'rgba(23, 32, 42, 0.36)',
    flex: 1
  },
  panel: {
    backgroundColor: colors.glass,
    borderColor: colors.glassBorder,
    borderRadius: theme.radii.surface,
    borderWidth: 1,
    gap: 16,
    maxWidth: 440,
    padding: 18,
    width: '100%',
    ...theme.shadow
  },
  panelHitArea: {
    maxWidth: 440,
    width: '100%'
  },
  rangePillTrack: {
    minWidth: 150,
  }
});
