import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { colors, styles } from '@/src/components/styles';
import { useRequiredLedger } from '@/src/hooks/useRequiredLedger';
import { getErrorMessage, getLedgerMembers, updateMyProfile } from '@/src/lib/ledger';
import { supabase } from '@/src/lib/supabase';
import type { LedgerMemberProfile } from '@/src/types/database';

export default function AccountSettingsScreen() {
  const {
    error: ledgerError,
    ledger,
    loading: ledgerLoading,
    reloadLedger,
    user
  } = useRequiredLedger();
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const realtimeSubscriptionSequenceRef = useRef(0);

  const loadMembers = useCallback(async (currentLedger = ledger) => {
    if (!currentLedger || !user) {
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const nextMembers = await getLedgerMembers(currentLedger.id);
      const currentMember = nextMembers.find((member) => member.user_id === user.id);

      setDisplayNameInput(currentMember?.profile.display_name || '用户');
      setMembers(nextMembers);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [ledger, user]);

  const refresh = useCallback(async () => {
    const nextLedger = await reloadLedger();
    await loadMembers(nextLedger);
  }, [loadMembers, reloadLedger]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    const ledgerId = ledger?.id;
    if (!ledgerId) {
      return undefined;
    }

    const subscriptionId = ++realtimeSubscriptionSequenceRef.current;
    const channel = supabase
      .channel(`ledger-account-${ledgerId}-${subscriptionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ledger_members',
          filter: `ledger_id=eq.${ledgerId}`
        },
        () => {
          loadMembers();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles'
        },
        () => {
          loadMembers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ledger?.id, loadMembers]);

  async function saveProfile() {
    setSavingProfile(true);
    try {
      await updateMyProfile(displayNameInput);
      await refresh();
    } catch (saveError) {
      Alert.alert('保存失败', saveError instanceof Error ? saveError.message : '请稍后重试');
    } finally {
      setSavingProfile(false);
    }
  }

  async function signOut() {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      Alert.alert('退出失败', signOutError.message);
      return;
    }

    router.replace('/auth');
  }

  if ((ledgerLoading || loading) && !ledger) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={ledgerLoading || loading} onRefresh={refresh} />}
      style={styles.page}
      contentContainerStyle={styles.content}
    >
      <View>
        <Text style={styles.title}>账户信息</Text>
        <Text style={styles.muted}>账户、登录状态和共享账本</Text>
      </View>

      {ledgerError || error ? <Text style={styles.error}>{ledgerError || error}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.h2}>个人资料</Text>
        <Text style={styles.label}>显示名称</Text>
        <TextInput onChangeText={setDisplayNameInput} style={styles.input} value={displayNameInput} />
        <Pressable disabled={savingProfile} onPress={saveProfile} style={styles.button}>
          <Text style={styles.buttonText}>{savingProfile ? '保存中...' : '保存名称'}</Text>
        </Pressable>

        <Text style={styles.label}>邮箱</Text>
        <View style={[styles.input, { justifyContent: 'center' }]}>
          <Text style={styles.body}>{user?.email || '未设置'}</Text>
        </View>

        <Pressable onPress={signOut} style={[styles.button, styles.secondaryButton]}>
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>退出登录</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>账本信息</Text>
        <Text style={styles.label}>账本名称</Text>
        <Text style={styles.body}>{ledger?.name || '共享账本'}</Text>
        <Text style={styles.label}>邀请码</Text>
        <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '900' }}>{ledger?.invite_code || '-'}</Text>
        <Text style={styles.label}>成员</Text>
        <View style={{ gap: 8 }}>
          {members.map((member) => (
            <Text key={member.user_id} style={styles.body}>
              {member.profile.display_name}{member.user_id === user?.id ? '（我）' : ''}
            </Text>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
