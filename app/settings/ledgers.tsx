import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { colors, styles } from '@/src/components/styles';
import { BentoCard } from '@/src/components/ui';
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
  const [ledgerName, setLedgerName] = useState('Shared Ledger');
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
      setLedgerName('Shared Ledger');
      router.replace('/(tabs)');
    } catch (createError) {
      Alert.alert('Create Failed', getErrorMessage(createError));
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
      Alert.alert('Join Failed', getErrorMessage(joinError));
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
        <Text style={styles.title}>Ledgers</Text>
        <Text style={styles.muted}>Create, join, and switch your ledgers</Text>
      </View>

      {ledgerError || error ? <Text style={styles.error}>{ledgerError || error}</Text> : null}
      {loading ? <ActivityIndicator /> : null}

      <BentoCard variant="list">
        <Text style={styles.h2}>My Ledgers</Text>
        <View style={{ gap: 10 }}>
          {ledgers.map((membership) => {
            const isActive = membership.ledger.id === activeLedger?.ledger.id;

            return (
              <View
                key={membership.ledger.id}
                style={{
                  borderColor: isActive ? colors.primary : colors.line,
                  backgroundColor: 'rgba(255,255,255,0.58)',
                  borderRadius: 16,
                  borderWidth: 1,
                  gap: 10,
                  padding: 12
                }}
              >
                <View style={styles.between}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.h2}>{membership.ledger.name}</Text>
                    <Text style={styles.muted}>
                      {isActive ? 'Current ledger' : 'Available'} · {membership.isOwner ? 'Owner' : 'Member'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => router.push(`/settings/ledger/${membership.ledger.id}`)}
                    style={[styles.button, styles.secondaryButton, { minHeight: 40 }]}
                  >
                    <Text style={[styles.buttonText, styles.secondaryButtonText]}>Details</Text>
                  </Pressable>
                </View>

                {!isActive ? (
                  <Pressable onPress={() => handleSelect(membership.ledger.id)} style={styles.button}>
                    <Text style={styles.buttonText}>Switch to This Ledger</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}

          {!loading && ledgers.length === 0 ? <Text style={styles.muted}>No ledgers yet.</Text> : null}
        </View>
      </BentoCard>

      <BentoCard variant="form">
        <Text style={styles.h2}>Create Ledger</Text>
        <Text style={styles.label}>Ledger Name</Text>
        <TextInput onChangeText={setLedgerName} style={styles.input} value={ledgerName} />
        <Pressable disabled={submitting} onPress={handleCreate} style={styles.button}>
          <Text style={styles.buttonText}>{submitting ? 'Processing...' : 'Create and Switch'}</Text>
        </Pressable>
      </BentoCard>

      <BentoCard variant="form">
        <Text style={styles.h2}>Join with Invite Code</Text>
        <Text style={styles.label}>Invite Code</Text>
        <TextInput
          autoCapitalize="characters"
          onChangeText={setInviteCode}
          placeholder="Example: A1B2C3D4"
          style={styles.input}
          value={inviteCode}
        />
        <Pressable disabled={submitting} onPress={handleJoin} style={[styles.button, styles.secondaryButton]}>
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>
            {submitting ? 'Processing...' : 'Join and Switch'}
          </Text>
        </Pressable>
      </BentoCard>
    </ScrollView>
  );
}
