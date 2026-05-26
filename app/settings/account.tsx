import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { styles } from '@/src/components/styles';
import { useRequiredLedger } from '@/src/hooks/useRequiredLedger';
import { getErrorMessage, getLedgerMembers, updateMyProfile } from '@/src/lib/ledger';
import { supabase } from '@/src/lib/supabase';

export default function AccountSettingsScreen() {
  const {
    error: ledgerError,
    ledger,
    loading: ledgerLoading,
    reloadLedger,
    user
  } = useRequiredLedger();
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!ledger || !user) {
      setLoadingProfile(false);
      return;
    }

    setError(null);
    setLoadingProfile(true);

    try {
      const members = await getLedgerMembers(ledger.id);
      const currentMember = members.find((member) => member.user_id === user.id);
      setDisplayNameInput(currentMember?.profile.display_name || '用户');
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoadingProfile(false);
    }
  }, [ledger, user]);

  const refresh = useCallback(async () => {
    await reloadLedger();
    await loadProfile();
  }, [loadProfile, reloadLedger]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function saveProfile() {
    setSavingProfile(true);
    try {
      await updateMyProfile(displayNameInput);
      await refresh();
    } catch (saveError) {
      Alert.alert('保存失败', getErrorMessage(saveError));
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

  if ((ledgerLoading || loadingProfile) && !ledger) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={ledgerLoading || loadingProfile} onRefresh={refresh} />}
      style={styles.page}
      contentContainerStyle={styles.content}
    >
      <View>
        <Text style={styles.title}>账户信息</Text>
        <Text style={styles.muted}>个人资料、登录状态和当前账本</Text>
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
        <Text style={styles.h2}>当前账本</Text>
        <Text style={styles.body}>{ledger?.name || '未选择账本'}</Text>
        <Text style={styles.muted}>创建、加入、切换和删除账本请进入账本管理。</Text>
        <Pressable onPress={() => router.push('/settings/ledgers')} style={styles.button}>
          <Text style={styles.buttonText}>进入账本管理</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
