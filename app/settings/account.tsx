import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { styles } from '@/src/components/styles';
import { BentoCard } from '@/src/components/ui';
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
      setDisplayNameInput(currentMember?.profile.display_name || 'User');
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
      Alert.alert('Save Failed', getErrorMessage(saveError));
    } finally {
      setSavingProfile(false);
    }
  }

  async function signOut() {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      Alert.alert('Sign Out Failed', signOutError.message);
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
        <Text style={styles.title}>Account</Text>
        <Text style={styles.muted}>Profile, sign-in status, and current ledger</Text>
      </View>

      {ledgerError || error ? <Text style={styles.error}>{ledgerError || error}</Text> : null}

      <BentoCard variant="form">
        <Text style={styles.h2}>Profile</Text>
        <Text style={styles.label}>Display Name</Text>
        <TextInput onChangeText={setDisplayNameInput} style={styles.input} value={displayNameInput} />
        <Pressable disabled={savingProfile} onPress={saveProfile} style={styles.button}>
          <Text style={styles.buttonText}>{savingProfile ? 'Saving...' : 'Save Name'}</Text>
        </Pressable>

        <Text style={styles.label}>Email</Text>
        <View style={[styles.input, { justifyContent: 'center' }]}>
          <Text style={styles.body}>{user?.email || 'Not set'}</Text>
        </View>

        <Pressable onPress={signOut} style={[styles.button, styles.secondaryButton]}>
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>Sign Out</Text>
        </Pressable>
      </BentoCard>

      <BentoCard>
        <Text style={styles.h2}>Current Ledger</Text>
        <Text style={styles.body}>{ledger?.name || 'No ledger selected'}</Text>
        <Text style={styles.muted}>Use ledger management to create, join, switch, or delete ledgers.</Text>
        <Pressable onPress={() => router.push('/settings/ledgers')} style={styles.button}>
          <Text style={styles.buttonText}>Open Ledger Management</Text>
        </Pressable>
      </BentoCard>
    </ScrollView>
  );
}
