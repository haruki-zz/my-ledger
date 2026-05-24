import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { colors, styles } from '@/src/components/styles';
import { currentMonthPrefix, displayName, formatYen } from '@/src/lib/format';
import { getExpenses, getMyLedger, getProfiles } from '@/src/lib/ledger';
import { supabase } from '@/src/lib/supabase';
import type { Expense, Ledger, Profile } from '@/src/types/database';

let realtimeSubscriptionSequence = 0;

export default function DashboardScreen() {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const currentLedger = await getMyLedger();
      if (!currentLedger) {
        router.replace('/ledger');
        return;
      }

      const nextExpenses = await getExpenses(currentLedger.id);
      const profileIds = nextExpenses.flatMap((expense) => [expense.paid_by, expense.recorded_by]);

      setLedger(currentLedger);
      setExpenses(nextExpenses);
      setProfiles(await getProfiles(profileIds));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '读取首页失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ledgerId = ledger?.id;

  useEffect(() => {
    if (!ledgerId) {
      return undefined;
    }

    const subscriptionId = ++realtimeSubscriptionSequence;
    const channel = supabase
      .channel(`ledger-dashboard-${ledgerId}-${subscriptionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expenses',
          filter: `ledger_id=eq.${ledgerId}`
        },
        () => {
          load();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expense_splits'
        },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ledgerId, load]);

  const monthlyExpenses = useMemo(() => {
    const monthPrefix = currentMonthPrefix();
    return expenses.filter((expense) => expense.spent_on.startsWith(monthPrefix));
  }, [expenses]);

  const monthlyTotal = useMemo(
    () => monthlyExpenses.reduce((sum, expense) => sum + expense.amount_yen, 0),
    [monthlyExpenses]
  );

  const recentExpenses = useMemo(() => expenses.slice(0, 5), [expenses]);

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      style={styles.page}
      contentContainerStyle={styles.content}
    >
      <View>
        <Text style={styles.title}>首页</Text>
        <Text style={styles.muted}>{ledger ? ledger.name : '共享账本'}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.label}>本月支出</Text>
        <Text style={{ color: colors.ink, fontSize: 34, fontWeight: '900' }}>
          {formatYen(monthlyTotal)}
        </Text>
        <Text style={styles.muted}>本月 {monthlyExpenses.length} 笔</Text>
      </View>

      <View style={{ gap: 12 }}>
        <View style={styles.between}>
          <Text style={styles.h2}>最近支出</Text>
          <Pressable onPress={() => router.push('/(tabs)/history')}>
            <Text style={{ color: colors.primaryDark, fontSize: 14, fontWeight: '800' }}>查看全部</Text>
          </Pressable>
        </View>

        {recentExpenses.map((expense) => (
          <Pressable
            key={expense.id}
            onPress={() => router.push(`/expenses/${expense.id}`)}
            style={styles.section}
          >
            <View style={styles.between}>
              <View style={{ flex: 1 }}>
                <Text style={styles.h2}>{expense.category}</Text>
                <Text style={styles.muted}>
                  {expense.spent_on} · 支付人：{displayName(profiles[expense.paid_by]?.display_name)}
                </Text>
              </View>
              <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '900' }}>
                {formatYen(expense.amount_yen)}
              </Text>
            </View>
          </Pressable>
        ))}

        {!loading && recentExpenses.length === 0 ? (
          <View style={styles.section}>
            <Text style={styles.h2}>还没有支出</Text>
            <Text style={styles.muted}>点击底部“记账”开始记录。</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
