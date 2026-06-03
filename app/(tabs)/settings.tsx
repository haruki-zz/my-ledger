import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, styles } from '@/src/components/styles';
import { InsetActionRow, SettingsSection } from '@/src/components/ui';
import { useAuth } from '@/src/context/AuthContext';
import { useSyncContext } from '@/src/context/SyncContext';
import { useRequiredLedger } from '@/src/hooks/useRequiredLedger';
import { getErrorMessage, getLedgerMembers } from '@/src/lib/ledger';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { session, signOut: signOutSession } = useAuth();
  const sync = useSyncContext();
  const { error, ledger, loading, reloadLedger } = useRequiredLedger();
  const ledgerId = ledger?.id;
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    if (!ledgerId) {
      setMemberCount(null);
      setMembersError(null);
      return;
    }

    setMembersLoading(true);
    setMembersError(null);

    try {
      const members = await getLedgerMembers(ledgerId);
      setMemberCount(members.length);
    } catch (loadError) {
      setMemberCount(null);
      setMembersError(getErrorMessage(loadError));
    } finally {
      setMembersLoading(false);
    }
  }, [ledgerId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function refresh() {
    await reloadLedger();
    await loadMembers();
  }

  async function shareInviteCode() {
    if (!ledger) {
      return;
    }

    try {
      await Share.share({
        message: `Join "${ledger.name}" with invite code: ${ledger.invite_code}`
      });
    } catch (shareError) {
      Alert.alert('Share Failed', getErrorMessage(shareError));
    }
  }

  async function signOut() {
    if (sync.hasUnsyncedChanges) {
      Alert.alert(
        'Unsynced Changes',
        'There are local changes that have not synced yet. Signing out now will discard them from this device.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Force Sign Out',
            style: 'destructive',
            onPress: () => {
              void forceSignOut();
            }
          }
        ]
      );
      return;
    }

    await forceSignOut();
  }

  async function forceSignOut() {
    try {
      await signOutSession();
    } catch (signOutError) {
      Alert.alert('Sign Out Failed', getErrorMessage(signOutError));
      return;
    }

    router.replace('/auth');
  }

  if (loading && !ledger) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={loading || membersLoading} onRefresh={refresh} />}
      style={styles.page}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
    >
      <View>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.muted}>Account, ledgers, and shared categories</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SettingsSection>
        <InsetActionRow
          description="Name, email, sign-in"
          icon="person-circle-outline"
          onPress={() => router.push('/settings/account')}
          showDivider
          title="Account"
        />
        <InsetActionRow
          description="Create, join, switch"
          icon="albums-outline"
          onPress={() => router.push('/settings/ledgers')}
          showDivider
          title="Ledgers"
        />
        <InsetActionRow
          description="Shared categories, split ratios"
          icon="pricetags-outline"
          onPress={() => router.push('/settings/categories')}
          showDivider
          title="Categories"
        />
        <InsetActionRow
          description={`${sync.pending} pending · ${sync.failed} failed · ${sync.conflict} conflicts`}
          icon="cloud-upload-outline"
          onPress={() => router.push('/settings/sync')}
          title="Sync status"
        />
      </SettingsSection>

      <View style={localStyles.sectionGroup}>
        <Text style={styles.upperLabel}>Current Ledger</Text>
        <SettingsSection>
          <InsetActionRow
            accent={colors.accent}
            description={[
              membersLoading ? 'Loading members...' : membersError ? 'Members unavailable' : `${memberCount ?? 0} members`,
              ledger?.invite_code || 'No invite code'
            ].join(' · ')}
            icon="sparkles-outline"
            onPress={() => ledger ? router.push(`/settings/ledger/${ledger.id}`) : undefined}
            title={ledger?.name || 'No ledger selected'}
            tone="accent"
          />
        </SettingsSection>
      </View>

      <View style={localStyles.sectionGroup}>
        <Text style={styles.upperLabel}>Quick Actions</Text>
        <SettingsSection>
          <InsetActionRow
            description={ledger?.invite_code || 'No active ledger'}
            disabled={!ledger}
            icon="share-social-outline"
            onPress={shareInviteCode}
            showDivider
            title="Share invite code"
            tone="warm"
          />
          <InsetActionRow
            description={session?.user.email || 'Current session'}
            icon="log-out-outline"
            onPress={signOut}
            title="Sign out"
            tone="danger"
          />
        </SettingsSection>
      </View>
    </ScrollView>
  );
}

const localStyles = StyleSheet.create({
  sectionGroup: {
    gap: 10
  }
});
