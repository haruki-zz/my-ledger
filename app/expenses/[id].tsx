import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { ExpenseForm } from '@/src/components/ExpenseForm';
import { styles } from '@/src/components/styles';
import { useLedgerContext } from '@/src/context/LedgerContext';
import {
  getExpense,
  getErrorMessage,
  getLedgerCategories,
  getLedgerMembers,
  getProfiles
} from '@/src/lib/ledger';
import { supabase } from '@/src/lib/supabase';
import type { Expense, Ledger, LedgerCategory, LedgerMemberProfile, Profile } from '@/src/types/database';

export default function EditExpenseScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const { activeLedger, loading: ledgerLoading } = useLedgerContext();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [categories, setCategories] = useState<LedgerCategory[] | undefined>(undefined);
  const [expense, setExpense] = useState<Expense | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (ledgerLoading) {
      return;
    }

    try {
      const expenseId = Array.isArray(params.id) ? params.id[0] : params.id;
      if (!expenseId) {
        throw new Error('Missing expense ID');
      }

      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.replace('/auth');
        return;
      }

      const currentExpense = await getExpense(expenseId);
      const currentLedger = activeLedger?.ledger || null;

      if (!currentLedger) {
        router.replace('/ledger');
        return;
      }

      if (currentExpense.ledger_id !== currentLedger.id) {
        throw new Error('This expense does not belong to the current ledger');
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
  }, [activeLedger?.ledger, ledgerLoading, params.id]);

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
        <Text style={styles.error}>{error || 'Could not edit expense'}</Text>
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
