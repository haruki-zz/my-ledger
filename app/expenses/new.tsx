import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { ExpenseForm } from '@/src/components/ExpenseForm';
import { styles } from '@/src/components/styles';
import { useLedgerContext } from '@/src/context/LedgerContext';
import {
  getLedgerCategories,
  getLedgerMembers,
  getErrorMessage,
  getProfiles
} from '@/src/lib/ledger';
import { supabase } from '@/src/lib/supabase';
import type { Ledger, LedgerCategory, LedgerMemberProfile, Profile } from '@/src/types/database';

export default function NewExpenseScreen() {
  const { activeLedger, loading: ledgerLoading } = useLedgerContext();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [categories, setCategories] = useState<LedgerCategory[] | undefined>(undefined);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (ledgerLoading) {
      return;
    }

    try {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.replace('/auth');
        return;
      }

      const currentLedger = activeLedger?.ledger || null;
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
      const nextProfiles = await getProfiles(nextMembers.map((member) => member.user_id));

      setCurrentUserId(userData.user.id);
      setLedger(currentLedger);
      setMembers(nextMembers);
      setCategories(nextCategories);
      setProfiles(nextProfiles);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [activeLedger?.ledger, ledgerLoading]);

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

  if (error || !ledger || !currentUserId) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || '无法创建支出'}</Text>
      </View>
    );
  }

  return (
    <ExpenseForm
      currentProfile={profiles[currentUserId]}
      currentUserId={currentUserId}
      categories={categories}
      ledger={ledger}
      members={members}
      profilesById={profiles}
    />
  );
}
