import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { colors, fontFamilies, styles } from '@/src/components/styles';
import { BentoCard, MetricTile } from '@/src/components/ui';
import { useLedgerContext } from '@/src/context/LedgerContext';
import { displayName, formatYen } from '@/src/lib/format';
import {
  deleteExpense,
  getExpenses,
  getLedgerMembers,
  getProfiles
} from '@/src/lib/ledger';
import { supabase } from '@/src/lib/supabase';
import type { Expense, Ledger, Profile } from '@/src/types/database';

let realtimeSubscriptionSequence = 0;

export default function HistoryScreen() {
  const { activeLedger, loading: ledgerLoading } = useLedgerContext();
  const currentLedger = activeLedger?.ledger || null;
  const activeLedgerId = activeLedger?.ledger.id || null;
  const currentLedgerRef = useRef<Ledger | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activeMemberIds, setActiveMemberIds] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    currentLedgerRef.current = currentLedger;
  }, [currentLedger]);

  const load = useCallback(async () => {
    if (ledgerLoading) {
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const activeLedger = currentLedgerRef.current;
      if (!activeLedger) {
        router.replace('/ledger');
        return;
      }

      const [nextExpenses, nextMembers] = await Promise.all([
        getExpenses(activeLedger.id),
        getLedgerMembers(activeLedger.id)
      ]);
      const profileIds = nextExpenses.flatMap((expense) => [
        expense.paid_by,
        expense.recorded_by,
        ...expense.splits.map((split) => split.user_id)
      ]);

      setLedger(activeLedger);
      setExpenses(nextExpenses);
      setActiveMemberIds(new Set(nextMembers.map((member) => member.user_id)));
      setProfiles(await getProfiles([...profileIds, ...nextMembers.map((member) => member.user_id)]));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load expenses');
    } finally {
      setLoading(false);
    }
  }, [ledgerLoading]);

  useEffect(() => {
    setLedger(null);
    setExpenses([]);
    setProfiles({});
    setActiveMemberIds(new Set());
  }, [activeLedgerId]);

  useEffect(() => {
    load();
  }, [activeLedgerId, load]);

  const ledgerId = activeLedgerId;

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

  const profileDisplayName = useCallback((userId: string) => {
    const suffix = activeMemberIds.has(userId) ? '' : ' (left)';
    return `${displayName(profiles[userId]?.display_name)}${suffix}`;
  }, [activeMemberIds, profiles]);

  async function confirmDelete(expenseId: string) {
    Alert.alert('Delete Expense', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteExpense(expenseId);
            await load();
          } catch (deleteError) {
            Alert.alert('Delete Failed', deleteError instanceof Error ? deleteError.message : 'Please try again later');
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
        <Text style={styles.title}>Expense History</Text>
        <Text style={styles.muted}>{ledger ? ledger.name : 'Shared Ledger'}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <BentoCard variant="hero" style={{ minHeight: 0 }}>
        <MetricTile
          helper={`${expenses.length} records`}
          icon="receipt-outline"
          label="Total"
          value={formatYen(total)}
        />
      </BentoCard>

      <View style={{ gap: 12 }}>
        {expenses.map((expense) => (
          <BentoCard key={expense.id} variant="list">
            <View style={styles.between}>
              <View style={{ flex: 1 }}>
                <Text style={styles.h2}>{expense.category}</Text>
                <Text style={styles.muted}>
                  {expense.spent_on} · {expense.ownership === 'shared' ? 'Shared expense' : 'Personal expense'}
                </Text>
              </View>
              <Text style={{ color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 20, fontWeight: '900' }}>
                {formatYen(expense.amount_yen)}
              </Text>
            </View>

            <View style={{ gap: 4 }}>
              <Text style={styles.muted}>Paid by: {profileDisplayName(expense.paid_by)}</Text>
              <Text style={styles.muted}>Recorded by: {profileDisplayName(expense.recorded_by)}</Text>
              {expense.note ? <Text style={styles.body}>{expense.note}</Text> : null}
            </View>

            {expense.splits.length > 0 ? (
              <View style={{ gap: 4 }}>
                {expense.splits.map((split) => (
                  <Text key={split.user_id} style={styles.muted}>
                    {profileDisplayName(split.user_id)} owes {formatYen(split.amount_yen)}
                  </Text>
                ))}
              </View>
            ) : null}

            <View style={styles.row}>
              <Pressable
                onPress={() => router.push(`/expenses/${expense.id}`)}
                style={[styles.button, styles.secondaryButton, { flex: 1 }]}
              >
                <Text style={[styles.buttonText, styles.secondaryButtonText]}>Edit</Text>
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(expense.id)}
                style={[styles.button, styles.dangerButton, { flex: 1 }]}
              >
                <Text style={styles.buttonText}>Delete</Text>
              </Pressable>
            </View>
          </BentoCard>
        ))}
      </View>

      {!loading && expenses.length === 0 ? (
        <BentoCard>
          <Text style={styles.h2}>No Expenses Yet</Text>
          <Text style={styles.muted}>Tap the floating add button to create the first Supabase-backed record.</Text>
        </BentoCard>
      ) : null}
    </ScrollView>
  );
}
