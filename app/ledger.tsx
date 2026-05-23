import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { colors, styles } from '@/src/components/styles';
import { createLedger, getLedgerMembers, getMyLedger, joinLedger } from '@/src/lib/ledger';
import { supabase } from '@/src/lib/supabase';
import type { Ledger, LedgerMemberProfile } from '@/src/types/database';

export default function LedgerScreen() {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [ledgerName, setLedgerName] = useState('我们的账本');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const currentLedger = await getMyLedger();
      setLedger(currentLedger);
      setMembers(currentLedger ? await getLedgerMembers(currentLedger.id) : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '读取账本失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    setSubmitting(true);
    setError(null);

    try {
      const created = await createLedger(ledgerName);
      setLedger(created);
      setMembers(await getLedgerMembers(created.id));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建账本失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin() {
    setSubmitting(true);
    setError(null);

    try {
      const joined = await joinLedger(inviteCode);
      setLedger(joined);
      setMembers(await getLedgerMembers(joined.id));
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : '加入账本失败');
    } finally {
      setSubmitting(false);
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

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      style={styles.page}
      contentContainerStyle={styles.content}
    >
      <View>
        <Text style={styles.title}>共享账本</Text>
        <Text style={styles.muted}>每个账本最多两名成员，双方都可以记账、编辑和删除。</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {ledger ? (
        <>
          <View style={styles.section}>
            <View style={styles.between}>
              <View style={{ flex: 1 }}>
                <Text style={styles.h2}>{ledger.name}</Text>
                <Text style={styles.muted}>邀请码：{ledger.invite_code}</Text>
              </View>
              <View
                style={{
                  backgroundColor: colors.tint,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 6
                }}
              >
                <Text style={{ color: colors.primaryDark, fontWeight: '800' }}>{members.length}/2</Text>
              </View>
            </View>

            <View style={{ gap: 8 }}>
              {members.map((member) => (
                <Text key={member.user_id} style={styles.body}>
                  {member.profile.display_name}
                </Text>
              ))}
            </View>

            <Pressable onPress={() => router.push('/expenses')} style={styles.button}>
              <Text style={styles.buttonText}>进入支出明细</Text>
            </Pressable>
          </View>

          <Pressable onPress={signOut} style={[styles.button, styles.secondaryButton]}>
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>退出登录</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.section}>
            <Text style={styles.h2}>创建账本</Text>
            <Text style={styles.label}>账本名称</Text>
            <TextInput onChangeText={setLedgerName} style={styles.input} value={ledgerName} />
            <Pressable disabled={submitting} onPress={handleCreate} style={styles.button}>
              <Text style={styles.buttonText}>{submitting ? '处理中...' : '创建并进入'}</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.h2}>加入账本</Text>
            <Text style={styles.label}>邀请码</Text>
            <TextInput
              autoCapitalize="characters"
              onChangeText={setInviteCode}
              placeholder="例如：A1B2C3D4"
              style={styles.input}
              value={inviteCode}
            />
            <Pressable disabled={submitting} onPress={handleJoin} style={[styles.button, styles.secondaryButton]}>
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>
                {submitting ? '处理中...' : '加入账本'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}
