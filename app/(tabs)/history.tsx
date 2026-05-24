import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { colors, styles } from '@/src/components/styles';
import { displayName, formatYen } from '@/src/lib/format';
import {
  deleteExpense,
  getExpenses,
  getMyLedger,
  getProfiles
} from '@/src/lib/ledger';
import { supabase } from '@/src/lib/supabase';
import type { Expense, Ledger, Profile } from '@/src/types/database';

let realtimeSubscriptionSequence = 0;

export default function HistoryScreen() {
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
      const profileIds = nextExpenses.flatMap((expense) => [
        expense.paid_by,
        expense.recorded_by,
        ...expense.splits.map((split) => split.user_id)
      ]);

      setLedger(currentLedger);
      setExpenses(nextExpenses);
      setProfiles(await getProfiles(profileIds));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '读取支出失败');
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
      .channel(`ledger-history-${ledgerId}-${subscriptionId}`)
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

  const total = useMemo(
    () => expenses.reduce((sum, expense) => sum + expense.amount_yen, 0),
    [expenses]
  );

  async function confirmDelete(expenseId: string) {
    Alert.alert('删除支出', '删除后无法恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteExpense(expenseId);
            await load();
          } catch (deleteError) {
            Alert.alert('删除失败', deleteError instanceof Error ? deleteError.message : '请稍后重试');
          }
        }
      }
    ]);
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      style={styles.page}
      contentContainerStyle={styles.content}
    >
      <View>
        <Text style={styles.title}>支出明细</Text>
        <Text style={styles.muted}>{ledger ? ledger.name : '共享账本'}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.h2}>合计</Text>
        <Text style={{ color: colors.ink, fontSize: 32, fontWeight: '900' }}>{formatYen(total)}</Text>
        <Text style={styles.muted}>当前明细共 {expenses.length} 笔</Text>
      </View>

      <View style={{ gap: 12 }}>
        {expenses.map((expense) => (
          <View key={expense.id} style={styles.section}>
            <View style={styles.between}>
              <View style={{ flex: 1 }}>
                <Text style={styles.h2}>{expense.category}</Text>
                <Text style={styles.muted}>
                  {expense.spent_on} · {expense.ownership === 'shared' ? '共同支出' : '个人支出'}
                </Text>
              </View>
              <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '900' }}>
                {formatYen(expense.amount_yen)}
              </Text>
            </View>

            <View style={{ gap: 4 }}>
              <Text style={styles.muted}>支付人：{displayName(profiles[expense.paid_by]?.display_name)}</Text>
              <Text style={styles.muted}>记录人：{displayName(profiles[expense.recorded_by]?.display_name)}</Text>
              {expense.note ? <Text style={styles.body}>{expense.note}</Text> : null}
            </View>

            {expense.splits.length > 0 ? (
              <View style={{ gap: 4 }}>
                {expense.splits.map((split) => (
                  <Text key={split.user_id} style={styles.muted}>
                    {displayName(profiles[split.user_id]?.display_name)}承担 {formatYen(split.amount_yen)}
                  </Text>
                ))}
              </View>
            ) : null}

            <View style={styles.row}>
              <Pressable
                onPress={() => router.push(`/expenses/${expense.id}`)}
                style={[styles.button, styles.secondaryButton, { flex: 1 }]}
              >
                <Text style={[styles.buttonText, styles.secondaryButtonText]}>编辑</Text>
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(expense.id)}
                style={[styles.button, styles.dangerButton, { flex: 1 }]}
              >
                <Text style={styles.buttonText}>删除</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      {!loading && expenses.length === 0 ? (
        <View style={styles.section}>
          <Text style={styles.h2}>还没有支出</Text>
          <Text style={styles.muted}>点击底部“记账”添加第一条 Supabase 持久化记录。</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
