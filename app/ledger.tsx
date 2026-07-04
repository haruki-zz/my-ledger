import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { KEYBOARD_DONE_ACCESSORY_ID } from '@/src/components/KeyboardDoneAccessory';
import { KeyboardAwareScrollView } from '@/src/components/KeyboardAwareScrollView';
import { fontFamilies, styles } from '@/src/components/styles';
import { BentoCard } from '@/src/components/ui';
import { useLedgerContext } from '@/src/context/LedgerContext';
import { runAfterKeyboardDismiss } from '@/src/lib/keyboard';
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
  const [ledgerName, setLedgerName] = useState('Ledger');
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
    <KeyboardAwareScrollView
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      style={styles.page}
      contentContainerStyle={styles.content}
    >
      <View>
        <Text style={styles.title}>Ledger</Text>
        <Text style={styles.muted}>Use a ledger on your own, or invite one other member when you want to track shared expenses.</Text>
      </View>

      {loading ? <ActivityIndicator /> : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <BentoCard variant="form">
        <Text style={styles.h2}>Create Ledger</Text>
        <Text style={styles.label}>Ledger Name</Text>
        <TextInput
          inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
          onChangeText={setLedgerName}
          returnKeyType="done"
          style={styles.input}
          submitBehavior="blurAndSubmit"
          value={ledgerName}
        />
        <Pressable disabled={submitting} onPress={() => runAfterKeyboardDismiss(handleCreate)} style={styles.button}>
          <Text style={styles.buttonText}>{submitting ? 'Processing...' : 'Create and Open'}</Text>
        </Pressable>
      </BentoCard>

      <BentoCard variant="form">
        <Text style={styles.h2}>Join Ledger</Text>
        <Text style={styles.label}>Invite Code</Text>
        <TextInput
          autoCapitalize="characters"
          inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
          onChangeText={setInviteCode}
          placeholder="Example: A1B2C3D4"
          returnKeyType="done"
          style={[styles.input, { fontFamily: fontFamilies.mono }]}
          submitBehavior="blurAndSubmit"
          value={inviteCode}
        />
        <Pressable disabled={submitting} onPress={() => runAfterKeyboardDismiss(handleJoin)} style={[styles.button, styles.secondaryButton]}>
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>
            {submitting ? 'Processing...' : 'Join Ledger'}
          </Text>
        </Pressable>
      </BentoCard>
    </KeyboardAwareScrollView>
  );
}
