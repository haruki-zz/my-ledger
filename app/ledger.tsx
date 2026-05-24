import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { styles } from '@/src/components/styles';
import { createLedger, getMyLedger, joinLedger } from '@/src/lib/ledger';

export default function LedgerScreen() {
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
      if (currentLedger) {
        router.replace('/(tabs)');
        return;
      }
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
      await createLedger(ledgerName);
      router.replace('/(tabs)');
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
      await joinLedger(inviteCode);
      router.replace('/(tabs)');
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : '加入账本失败');
    } finally {
      setSubmitting(false);
    }
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
    </ScrollView>
  );
}
