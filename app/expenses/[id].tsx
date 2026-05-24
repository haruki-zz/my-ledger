import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { ExpenseForm } from '@/src/components/ExpenseForm';
import { styles } from '@/src/components/styles';
import {
  getExpense,
  getErrorMessage,
  getLedgerCategories,
  getLedgerMembers,
  getMyLedger,
  getProfiles
} from '@/src/lib/ledger';
import { supabase } from '@/src/lib/supabase';
import type { Expense, Ledger, LedgerCategory, LedgerMemberProfile, Profile } from '@/src/types/database';

export default function EditExpenseScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [categories, setCategories] = useState<LedgerCategory[] | undefined>(undefined);
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

      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.replace('/auth');
        return;
      }

      const [currentLedger, currentExpense] = await Promise.all([
        getMyLedger(),
        getExpense(expenseId)
      ]);

      if (!currentLedger) {
        router.replace('/ledger');
        return;
      }

      const nextMembers = await getLedgerMembers(currentLedger.id);
      let nextCategories: LedgerCategory[] | undefined;
      try {
        const ledgerCategories = await getLedgerCategories(currentLedger.id);
        nextCategories = ledgerCategories.length > 0 ? ledgerCategories : undefined;
      } catch (categoriesError) {
        console.warn('Falling back to default categories:', getErrorMessage(categoriesError));
      }
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
      setCategories(nextCategories);
      setExpense(currentExpense);
      setProfiles(nextProfiles);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
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
      categories={categories}
      expense={expense}
      ledger={ledger}
      members={members}
      profilesById={profiles}
    />
  );
}
