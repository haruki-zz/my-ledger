import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { ExpenseForm } from '@/src/components/ExpenseForm';
import { styles } from '@/src/components/styles';
import { useAuth } from '@/src/context/AuthContext';
import { useLedgerContext } from '@/src/context/LedgerContext';
import {
  getLedgerMembers,
  getErrorMessage,
  getProfiles,
  getRecurringExpenseRules
} from '@/src/lib/ledger';
import type { Ledger, LedgerMemberProfile, Profile, RecurringExpenseRule } from '@/src/types/database';

export default function NewExpenseScreen() {
  const { loading: authLoading, session } = useAuth();
  const { activeLedger, loading: ledgerLoading } = useLedgerContext();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [recurringRules, setRecurringRules] = useState<RecurringExpenseRule[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (authLoading || ledgerLoading) {
      return;
    }

    try {
      const user = session?.user || null;
      if (!user) {
        router.replace('/auth');
        return;
      }

      const currentLedger = activeLedger?.ledger || null;
      if (!currentLedger) {
        router.replace('/ledger');
        return;
      }

      const [nextMembers, nextRecurringRules] = await Promise.all([
        getLedgerMembers(currentLedger.id),
        getRecurringExpenseRules(currentLedger.id)
      ]);
      const nextProfiles = await getProfiles(nextMembers.map((member) => member.user_id));

      setCurrentUserId(user.id);
      setLedger(currentLedger);
      setMembers(nextMembers);
      setRecurringRules(nextRecurringRules);
      setProfiles(nextProfiles);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [activeLedger?.ledger, authLoading, ledgerLoading, session?.user]);

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
        <Text style={styles.error}>{error || 'Could not create expense'}</Text>
      </View>
    );
  }

  return (
    <ExpenseForm
      currentProfile={profiles[currentUserId]}
      currentUserId={currentUserId}
      ledger={ledger}
      members={members}
      profilesById={profiles}
      recurringRules={recurringRules}
    />
  );
}
