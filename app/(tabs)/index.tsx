import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CategoryTrendModal } from '@/src/components/CategoryTrendModal';
import { DailyChart, type DailyChartMode } from '@/src/components/DailyChart';
import { PieChart } from '@/src/components/PieChart';
import { colors, styles } from '@/src/components/styles';
import { useDashboardData } from '@/src/hooks/useDashboardData';
import { displayName, formatYen } from '@/src/lib/format';
import {
  addMonths,
  compareMonthKeys,
  currentMonthKey,
  formatMonthLabel,
  type CategoryStat,
  type DashboardRange
} from '@/src/lib/stats';

type RangeOption = {
  label: string;
  value: DashboardRange;
};

const CHART_MODES: { label: string; value: DailyChartMode }[] = [
  { label: '曲线', value: 'curve' },
  { label: '柱状', value: 'bar' }
];

export default function DashboardScreen() {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [range, setRange] = useState<DashboardRange>('all');
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const [chartMode, setChartMode] = useState<DailyChartMode>('curve');
  const [selectedCategory, setSelectedCategory] = useState<CategoryStat | null>(null);
  const {
    ledger,
    members,
    currentUserId,
    otherUserId,
    minimumMonthKey,
    loadedMonthKey,
    stats,
    dataVersion,
    loading,
    refreshing,
    error,
    reload
  } = useDashboardData(monthKey, range);

  const currentUserName = displayName(members.find((member) => member.user_id === currentUserId)?.profile.display_name);
  const otherUserName = displayName(members.find((member) => member.user_id === otherUserId)?.profile.display_name);
  const rangeOptions: RangeOption[] = [
    { label: '双方', value: 'all' },
    { label: currentUserName, value: 'current' },
    { label: otherUserId ? otherUserName : '对方', value: 'other' }
  ];
  const selectedRangeLabel = rangeOptions.find((option) => option.value === range)?.label || '双方';
  const atCurrentMonth = compareMonthKeys(monthKey, currentMonthKey()) >= 0;
  const atMinimumMonth = minimumMonthKey ? compareMonthKeys(monthKey, minimumMonthKey) <= 0 : false;
  const isSwitchingMonth = refreshing && Boolean(loadedMonthKey && loadedMonthKey !== monthKey);

  useEffect(() => {
    if (range === 'other' && !otherUserId) {
      setRange('all');
    }
  }, [otherUserId, range]);

  function moveMonth(amount: number) {
    setMonthKey((current) => addMonths(current, amount));
  }

  function selectRange(nextRange: DashboardRange) {
    setRange(nextRange);
    setRangeMenuOpen(false);
  }

  return (
    <>
      <ScrollView
        refreshControl={<RefreshControl refreshing={(loading && !ledger) || refreshing} onRefresh={reload} />}
        style={styles.page}
        contentContainerStyle={styles.content}
      >
        <View>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.muted}>{ledger ? ledger.name : '共享账本'}</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.section}>
          <View style={styles.between}>
            <Pressable
              disabled={atMinimumMonth}
              onPress={() => moveMonth(-1)}
              style={({ pressed }) => [
                localStyles.iconButton,
                atMinimumMonth && localStyles.disabledButton,
                pressed && !atMinimumMonth && localStyles.pressed
              ]}
            >
              <Ionicons color={atMinimumMonth ? colors.muted : colors.primaryDark} name="chevron-back" size={22} />
            </Pressable>

            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={styles.h2}>{formatMonthLabel(monthKey)}</Text>
              {isSwitchingMonth ? <Text style={styles.muted}>正在更新...</Text> : null}
            </View>

            <Pressable
              disabled={atCurrentMonth}
              onPress={() => moveMonth(1)}
              style={({ pressed }) => [
                localStyles.iconButton,
                atCurrentMonth && localStyles.disabledButton,
                pressed && !atCurrentMonth && localStyles.pressed
              ]}
            >
              <Ionicons color={atCurrentMonth ? colors.muted : colors.primaryDark} name="chevron-forward" size={22} />
            </Pressable>
          </View>

          <View style={styles.dropdown}>
            <Text style={styles.label}>统计对象</Text>
            <Pressable
              onPress={() => setRangeMenuOpen((current) => !current)}
              style={[styles.dropdownTrigger, rangeMenuOpen && styles.dropdownTriggerActive]}
            >
              <Text style={styles.dropdownValue}>{selectedRangeLabel}</Text>
              <Text style={styles.dropdownIndicator}>{rangeMenuOpen ? '⌃' : '⌄'}</Text>
            </Pressable>

            {rangeMenuOpen ? (
              <View style={styles.dropdownMenu}>
                {rangeOptions.map((option) => {
                  const selected = range === option.value;
                  const disabled = option.value === 'other' && !otherUserId;
                  return (
                    <Pressable
                      disabled={disabled}
                      key={option.value}
                      onPress={() => selectRange(option.value)}
                      style={[
                        styles.dropdownOption,
                        selected && styles.dropdownOptionActive,
                        disabled && localStyles.disabledButton
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          selected && styles.dropdownOptionTextActive,
                          disabled && localStyles.disabledText
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.between}>
            <Text style={styles.label}>月度总支出</Text>
            {refreshing ? <ActivityIndicator color={colors.primary} size="small" /> : null}
          </View>
          <Text style={{ color: colors.ink, fontSize: 34, fontWeight: '900' }}>
            {formatYen(stats.totalYen)}
          </Text>
          <Text style={styles.muted}>
            {stats.count > 0 ? `${formatMonthLabel(loadedMonthKey || monthKey)} ${stats.count} 笔` : '这个月还没有支出记录'}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.between}>
            <Text style={styles.h2}>类别占比</Text>
            {isSwitchingMonth ? <Text style={styles.muted}>更新中</Text> : null}
          </View>
          <PieChart categories={stats.categories} onCategoryPress={setSelectedCategory} totalYen={stats.totalYen} />
        </View>

        <View style={styles.section}>
          <View style={styles.between}>
            <Text style={styles.h2}>每日趋势</Text>
            {isSwitchingMonth ? <Text style={styles.muted}>更新中</Text> : null}
          </View>

          <View style={styles.row}>
            {CHART_MODES.map((mode) => {
              const selected = chartMode === mode.value;
              return (
                <Pressable
                  key={mode.value}
                  onPress={() => setChartMode(mode.value)}
                  style={[styles.chip, selected && styles.chipActive]}
                >
                  <Text style={styles.chipText}>{mode.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <DailyChart mode={chartMode} series={stats.dailySeries} />
        </View>
      </ScrollView>

      <CategoryTrendModal
        category={selectedCategory}
        currentUserId={currentUserId}
        dataVersion={dataVersion}
        endMonthKey={loadedMonthKey || monthKey}
        ledgerId={ledger?.id || null}
        onClose={() => setSelectedCategory(null)}
        otherUserId={otherUserId}
        range={range}
        visible={Boolean(selectedCategory)}
      />
    </>
  );
}

const localStyles = StyleSheet.create({
  disabledButton: {
    opacity: 0.45
  },
  disabledText: {
    color: colors.muted
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.tint,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  pressed: {
    opacity: 0.75
  }
});
