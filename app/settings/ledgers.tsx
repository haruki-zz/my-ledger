import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { colors, styles } from '@/src/components/styles';
import { useLedgerContext } from '@/src/context/LedgerContext';
import { getErrorMessage } from '@/src/lib/ledger';

export default function LedgerManagementScreen() {
  const {
    activeLedger,
    createAndSelect,
    error: ledgerError,
    joinAndSelect,
    ledgers,
    loading,
    reloadLedgers,
    selectLedger
  } = useLedgerContext();
  const [ledgerName, setLedgerName] = useState('我们的账本');
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(ledgerId: string) {
    setError(null);
    try {
      await selectLedger(ledgerId);
      router.replace('/(tabs)');
    } catch (selectError) {
      setError(getErrorMessage(selectError));
    }
  }

  async function handleCreate() {
    setSubmitting(true);
    setError(null);

    try {
      await createAndSelect(ledgerName);
      setLedgerName('我们的账本');
      router.replace('/(tabs)');
    } catch (createError) {
      Alert.alert('创建失败', getErrorMessage(createError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin() {
    setSubmitting(true);
    setError(null);

    try {
      await joinAndSelect(inviteCode);
      setInviteCode('');
      router.replace('/(tabs)');
    } catch (joinError) {
      Alert.alert('加入失败', getErrorMessage(joinError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => reloadLedgers()} />}
      style={styles.page}
      contentContainerStyle={styles.content}
    >
      <View>
        <Text style={styles.title}>账本管理</Text>
        <Text style={styles.muted}>创建、加入和切换你的账本</Text>
      </View>

      {ledgerError || error ? <Text style={styles.error}>{ledgerError || error}</Text> : null}
      {loading ? <ActivityIndicator /> : null}

      <View style={styles.section}>
        <Text style={styles.h2}>我的账本</Text>
        <View style={{ gap: 10 }}>
          {ledgers.map((membership) => {
            const isActive = membership.ledger.id === activeLedger?.ledger.id;

            return (
              <View
                key={membership.ledger.id}
                style={{
                  borderColor: isActive ? colors.primary : colors.line,
                  borderRadius: 8,
                  borderWidth: 1,
                  gap: 10,
                  padding: 12
                }}
              >
                <View style={styles.between}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.h2}>{membership.ledger.name}</Text>
                    <Text style={styles.muted}>
                      {isActive ? '当前账本' : '可切换'} · {membership.isOwner ? '创建者' : '成员'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => router.push(`/settings/ledger/${membership.ledger.id}`)}
                    style={[styles.button, styles.secondaryButton, { minHeight: 40 }]}
                  >
                    <Text style={[styles.buttonText, styles.secondaryButtonText]}>详情</Text>
                  </Pressable>
                </View>

                {!isActive ? (
                  <Pressable onPress={() => handleSelect(membership.ledger.id)} style={styles.button}>
                    <Text style={styles.buttonText}>切换到此账本</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}

          {!loading && ledgers.length === 0 ? <Text style={styles.muted}>还没有账本。</Text> : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>创建账本</Text>
        <Text style={styles.label}>账本名称</Text>
        <TextInput onChangeText={setLedgerName} style={styles.input} value={ledgerName} />
        <Pressable disabled={submitting} onPress={handleCreate} style={styles.button}>
          <Text style={styles.buttonText}>{submitting ? '处理中...' : '创建并切换'}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>通过邀请码加入</Text>
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
            {submitting ? '处理中...' : '加入并切换'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
