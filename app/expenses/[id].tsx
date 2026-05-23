import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { ExpenseForm } from '@/src/components/ExpenseForm';
import { styles } from '@/src/components/styles';
import { getExpense, getLedgerMembers, getMyLedger, getProfiles } from '@/src/lib/ledger';
import { supabase } from '@/src/lib/supabase';
import type { Expense, Ledger, LedgerMemberProfile, Profile } from '@/src/types/database';

export default function EditExpenseScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [expense, setExpense] = useState<Expense | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const expenseId = Array.isArray(params.id) ? params.id[0] : params.id;
      if (!expenseId) {
        throw new Error('缺少支出 ID');
      }

      const [{ data: userData }, currentLedger, currentExpense] = await Promise.all([
        supabase.auth.getUser(),
        getMyLedger(),
        getExpense(expenseId)
      ]);

      if (!userData.user) {
        router.replace('/auth');
        return;
      }

      if (!currentLedger) {
        router.replace('/ledger');
        return;
      }

      const nextMembers = await getLedgerMembers(currentLedger.id);
      const profileIds = [
        ...nextMembers.map((member) => member.user_id),
        currentExpense.paid_by,
        currentExpense.recorded_by,
        ...currentExpense.splits.map((split) => split.user_id)
      ];
      const nextProfiles = await getProfiles(profileIds);

      setCurrentUserId(userData.user.id);
      setLedger(currentLedger);
      setMembers(nextMembers);
      setExpense(currentExpense);
      setProfiles(nextProfiles);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !ledger || !currentUserId || !expense) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || '无法编辑支出'}</Text>
      </View>
    );
  }

  return (
    <ExpenseForm
      currentProfile={profiles[currentUserId]}
      currentUserId={currentUserId}
      expense={expense}
      ledger={ledger}
      members={members}
      profilesById={profiles}
    />
  );
}
