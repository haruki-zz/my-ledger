import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { ExpenseForm } from '@/src/components/ExpenseForm';
import { styles } from '@/src/components/styles';
import { getLedgerMembers, getMyLedger, getProfiles } from '@/src/lib/ledger';
import { supabase } from '@/src/lib/supabase';
import type { Ledger, LedgerMemberProfile, Profile } from '@/src/types/database';

export default function NewExpenseScreen() {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [{ data: userData }, currentLedger] = await Promise.all([
        supabase.auth.getUser(),
        getMyLedger()
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
      const nextProfiles = await getProfiles(nextMembers.map((member) => member.user_id));

      setCurrentUserId(userData.user.id);
      setLedger(currentLedger);
      setMembers(nextMembers);
      setProfiles(nextProfiles);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

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
      ledger={ledger}
      members={members}
      profilesById={profiles}
    />
  );
}
