import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { styles } from '@/src/components/styles';
import { BentoCard } from '@/src/components/ui';
import { useLedgerContext } from '@/src/context/LedgerContext';
import { getErrorMessage } from '@/src/lib/ledger';

export default function LedgerScreen() {
  const {
    activeLedger,
    createAndSelect,
    joinAndSelect,
    ledgers,
    loading,
    reloadLedgers
  } = useLedgerContext();
  const [ledgerName, setLedgerName] = useState('我们的账本');
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didRedirectRef = useRef(false);

  async function refresh() {
    setError(null);

    try {
      const nextLedger = await reloadLedgers();
      if (nextLedger) {
        didRedirectRef.current = true;
        router.replace('/(tabs)');
      }
    } catch (refreshError) {
      setError(getErrorMessage(refreshError));
    }
  }

  useEffect(() => {
    if (!didRedirectRef.current && !submitting && !loading && (activeLedger || ledgers.length > 0)) {
      didRedirectRef.current = true;
      router.replace('/(tabs)');
    }
  }, [activeLedger, ledgers.length, loading, submitting]);

  async function handleCreate() {
    setSubmitting(true);
    setError(null);

    try {
      await createAndSelect(ledgerName);
      didRedirectRef.current = true;
      router.replace('/(tabs)');
    } catch (createError) {
      setError(getErrorMessage(createError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin() {
    setSubmitting(true);
    setError(null);

    try {
      await joinAndSelect(inviteCode);
      didRedirectRef.current = true;
      router.replace('/(tabs)');
    } catch (joinError) {
      setError(getErrorMessage(joinError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      style={styles.page}
      contentContainerStyle={styles.content}
    >
      <View>
        <Text style={styles.title}>共享账本</Text>
        <Text style={styles.muted}>每个账本最多两名成员，双方都可以记账、编辑和删除。</Text>
      </View>

      {loading ? <ActivityIndicator /> : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <BentoCard variant="form">
        <Text style={styles.h2}>创建账本</Text>
        <Text style={styles.label}>账本名称</Text>
        <TextInput onChangeText={setLedgerName} style={styles.input} value={ledgerName} />
        <Pressable disabled={submitting} onPress={handleCreate} style={styles.button}>
          <Text style={styles.buttonText}>{submitting ? '处理中...' : '创建并进入'}</Text>
        </Pressable>
      </BentoCard>

      <BentoCard variant="form">
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
      </BentoCard>
    </ScrollView>
  );
}
