import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { colors, fontFamilies, styles } from '@/src/components/styles';
import { BentoCard } from '@/src/components/ui';
import { useAuth } from '@/src/context/AuthContext';
import { useLedgerContext } from '@/src/context/LedgerContext';
import { getErrorMessage, getLedgerMembers } from '@/src/lib/ledger';
import type { LedgerMemberProfile } from '@/src/types/database';

export default function LedgerDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const ledgerId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { session } = useAuth();
  const {
    activeLedger,
    deleteLedger,
    leaveLedger,
    ledgers,
    loading: ledgerLoading,
    reloadLedgers,
    selectLedger
  } = useLedgerContext();
  const membership = ledgers.find((candidate) => candidate.ledger.id === ledgerId) || null;
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadedMissingLedgerId, setReloadedMissingLedgerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    if (!ledgerId) {
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const nextMembers = await getLedgerMembers(ledgerId);
      setMembers(nextMembers);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [ledgerId]);

  useEffect(() => {
    if (!ledgerLoading && ledgerId && !membership && reloadedMissingLedgerId !== ledgerId) {
      setReloadedMissingLedgerId(ledgerId);
      void reloadLedgers(ledgerId);
    }
  }, [ledgerId, ledgerLoading, membership, reloadedMissingLedgerId, reloadLedgers]);

  useEffect(() => {
    if (membership) {
      void loadMembers();
    } else if (!ledgerLoading) {
      setLoading(false);
    }
  }, [ledgerLoading, loadMembers, membership]);

  async function handleSelect() {
    if (!ledgerId) {
      return;
    }

    setSubmitting(true);
    try {
      await selectLedger(ledgerId);
      router.replace('/(tabs)');
    } catch (selectError) {
      Alert.alert('Switch Failed', getErrorMessage(selectError));
    } finally {
      setSubmitting(false);
    }
  }

  function confirmLeave() {
    if (!membership) {
      return;
    }

    Alert.alert('Leave Ledger', `After leaving "${membership.ledger.name}", you will no longer be able to view this ledger. Historical expenses and unsettled balances remain for other members.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setSubmitting(true);
          try {
            const nextLedger = await leaveLedger(membership.ledger.id);
            router.replace(nextLedger ? '/settings/ledgers' : '/ledger');
          } catch (leaveError) {
            Alert.alert('Leave Failed', getErrorMessage(leaveError));
          } finally {
            setSubmitting(false);
          }
        }
      }
    ]);
  }

  function confirmDelete() {
    if (!membership) {
      return;
    }

    Alert.alert(
      'Delete Ledger',
      `After deleting "${membership.ledger.name}", the ledger, expense history, categories, and member-visible data will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              const nextLedger = await deleteLedger(membership.ledger.id);
              router.replace(nextLedger ? '/settings/ledgers' : '/ledger');
            } catch (deleteError) {
              Alert.alert('Delete Failed', getErrorMessage(deleteError));
            } finally {
              setSubmitting(false);
            }
          }
        }
      ]
    );
  }

  if (ledgerLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!membership) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>This ledger was not found, or you are no longer a member.</Text>
      </View>
    );
  }

  const isActive = activeLedger?.ledger.id === membership.ledger.id;

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={ledgerLoading || loading} onRefresh={loadMembers} />}
      style={styles.page}
      contentContainerStyle={styles.content}
    >
      <View>
        <Text style={styles.title}>{membership.ledger.name}</Text>
        <Text style={styles.muted}>{isActive ? 'Current ledger' : 'Ledger details'}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <BentoCard>
        <Text style={styles.h2}>Invite Code</Text>
        <Text style={{ color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 24, fontWeight: '900' }}>
          {membership.ledger.invite_code}
        </Text>
      </BentoCard>

      <BentoCard variant="list">
        <Text style={styles.h2}>Members</Text>
        <View style={{ gap: 8 }}>
          {members.map((member) => {
            const labels = [
              member.user_id === session?.user.id ? 'Me' : null,
              member.user_id === membership.ledger.created_by ? 'Owner' : null
            ].filter(Boolean);

            return (
              <Text key={member.user_id} style={styles.body}>
                {member.profile.display_name}{labels.length > 0 ? ` (${labels.join(', ')})` : ''}
              </Text>
            );
          })}
        </View>
      </BentoCard>

      <BentoCard variant="danger">
        <Text style={styles.h2}>Actions</Text>
        {!isActive ? (
          <Pressable disabled={submitting} onPress={handleSelect} style={styles.button}>
            <Text style={styles.buttonText}>{submitting ? 'Processing...' : 'Switch to This Ledger'}</Text>
          </Pressable>
        ) : null}

        {membership.isOwner ? (
          <Pressable disabled={submitting} onPress={confirmDelete} style={[styles.button, styles.dangerButton]}>
            <Text style={styles.buttonText}>{submitting ? 'Processing...' : 'Delete Ledger'}</Text>
          </Pressable>
        ) : (
          <Pressable disabled={submitting} onPress={confirmLeave} style={[styles.button, styles.dangerButton]}>
            <Text style={styles.buttonText}>{submitting ? 'Processing...' : 'Leave Ledger'}</Text>
          </Pressable>
        )}
      </BentoCard>
    </ScrollView>
  );
}
