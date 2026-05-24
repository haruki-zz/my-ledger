import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoryMonthlyTrendChart } from '@/src/components/CategoryMonthlyTrendChart';
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
  onClose
}: CategoryTrendModalProps) {
  const [trendMonths, setTrendMonths] = useState<TrendMonths>(3);
  const [menuOpen, setMenuOpen] = useState(false);
  const selectedOption = TREND_RANGE_OPTIONS.find((option) => option.value === trendMonths) || TREND_RANGE_OPTIONS[0];
  const isCurrentMonthTrend = endMonthKey === currentMonthKey();
  const trend = useCategoryTrend({
    ledgerId,
    category: category?.category || null,
    endMonthKey,
    months: trendMonths,
    range,
    currentUserId,
    otherUserId,
    dataVersion
  });

  useEffect(() => {
    if (visible) {
      setTrendMonths(3);
      setMenuOpen(false);
    }
  }, [category?.category, visible]);

  function selectTrendMonths(nextMonths: TrendMonths) {
    setTrendMonths(nextMonths);
    setMenuOpen(false);
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.panel}>
          <View style={styles.between}>
            <View style={{ flex: 1 }}>
              <Text style={styles.h2}>{category?.category || '类别趋势'}</Text>
              <Text style={styles.muted}>截至 {formatMonthLabel(endMonthKey)}</Text>
              {isCurrentMonthTrend ? <Text style={styles.muted}>本月数据截至今天</Text> : null}
            </View>
            <Pressable hitSlop={10} onPress={onClose} style={modalStyles.closeButton}>
              <Ionicons color={colors.primaryDark} name="close" size={22} />
            </Pressable>
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
              <CategoryMonthlyTrendChart color={category?.color || colors.primary} series={trend.series} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.tint,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40
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
    alignItems: 'center',
    backgroundColor: 'rgba(23, 32, 42, 0.36)',
    flex: 1,
    justifyContent: 'center',
    padding: 20
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
  }
});
