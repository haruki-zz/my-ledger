import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, styles } from '@/src/components/styles';
import {
  completedAtForUser,
  isParticipant
} from '@/src/components/TransferChecklistShared';
import { TransferItemsOverlay } from '@/src/components/TransferItemsOverlay';
import { BentoCard } from '@/src/components/ui';
import { displayName, formatYen } from '@/src/lib/format';
import type { TransferConfirmationUpdate } from '@/src/lib/ledger';
import type { LedgerMemberProfile, TransferChecklistItemRow } from '@/src/types/database';

type TransferChecklistCardProps = {
  currentUserId: string | null;
  error: string | null;
  items: TransferChecklistItemRow[];
  loading: boolean;
  members: LedgerMemberProfile[];
  onSetConfirmations: (updates: TransferConfirmationUpdate[]) => Promise<void>;
  refreshing: boolean;
  saving: boolean;
};

type NetSummary = {
  amountYen: number;
  count: number;
  payerUserId: string | null;
  payeeUserId: string | null;
};

export function TransferChecklistCard({
  currentUserId,
  error,
  items,
  loading,
  members,
  onSetConfirmations,
  refreshing,
  saving
}: TransferChecklistCardProps) {
  const [overlayVisible, setOverlayVisible] = useState(false);
  const nameByUserId = useMemo(() => (
    new Map(members.map((member) => [member.user_id, displayName(member.profile.display_name)]))
  ), [members]);
  const netSummary = useMemo(() => buildNetSummary(items, members), [items, members]);
  const canOpenDetails = items.length > 0 && !loading;

  function userName(userId: string | null) {
    if (!userId) {
      return 'Both users';
    }

    return nameByUserId.get(userId) || 'Unnamed user';
  }

  function directionLabel() {
    if (loading) {
      return 'Loading transfers';
    }

    if (netSummary.amountYen === 0) {
      return 'Net balance settled';
    }

    if (netSummary.payerUserId === currentUserId) {
      return `You owe ${userName(netSummary.payeeUserId)}`;
    }

    if (netSummary.payeeUserId === currentUserId) {
      return `${userName(netSummary.payerUserId)} owes you`;
    }

    return `${userName(netSummary.payerUserId)} to ${userName(netSummary.payeeUserId)}`;
  }

  function toggleItem(item: TransferChecklistItemRow) {
    if (!currentUserId || saving || !isParticipant(item, currentUserId)) {
      return;
    }

    void onSetConfirmations([{
      expense_id: item.expense_id,
      confirmed: !completedAtForUser(item, currentUserId)
    }]);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        disabled={!canOpenDetails}
        onPress={() => setOverlayVisible(true)}
      >
        {({ pressed }) => (
          <BentoCard style={[localStyles.card, pressed && canOpenDetails && localStyles.cardPressed]}>
            <View style={localStyles.iconWrap}>
              <Ionicons color={colors.primaryDark} name="swap-horizontal" size={28} />
            </View>

            <View style={localStyles.textGroup}>
              <Text style={styles.upperLabel}>Transfers (Net)</Text>
              <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.directionText}>
                {directionLabel()}
              </Text>
              <Text style={styles.muted}>
                {loading
                  ? 'Checking open items'
                  : netSummary.count > 0
                    ? `${netSummary.count} open ${netSummary.count === 1 ? 'item' : 'items'}`
                    : 'All transfers settled'}
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {refreshing ? <Text style={styles.muted}>Syncing</Text> : null}
            </View>

            <View style={localStyles.amountGroup}>
              {loading ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.amountText}>
                  {formatYen(netSummary.amountYen)}
                </Text>
              )}
              <Ionicons color={canOpenDetails ? colors.ink : colors.subtle} name="chevron-forward" size={20} />
            </View>
          </BentoCard>
        )}
      </Pressable>

      <TransferItemsOverlay
        currentUserId={currentUserId}
        items={items}
        onClose={() => setOverlayVisible(false)}
        onToggleItem={toggleItem}
        saving={saving}
        userName={userName}
        visible={overlayVisible}
      />
    </>
  );
}

function buildNetSummary(items: TransferChecklistItemRow[], members: LedgerMemberProfile[]): NetSummary {
  const userIds = members.map((member) => member.user_id);
  const userIdSet = new Set(userIds);

  for (const item of items) {
    if (!userIdSet.has(item.payer_user_id)) {
      userIds.push(item.payer_user_id);
      userIdSet.add(item.payer_user_id);
    }

    if (!userIdSet.has(item.payee_user_id)) {
      userIds.push(item.payee_user_id);
      userIdSet.add(item.payee_user_id);
    }
  }

  const firstUserId = userIds[0] || null;
  const secondUserId = userIds.find((userId) => userId !== firstUserId) || null;
  let firstToSecond = 0;
  let secondToFirst = 0;

  for (const item of items) {
    if (item.payer_user_id === firstUserId && item.payee_user_id === secondUserId) {
      firstToSecond += item.amount_yen;
      continue;
    }

    if (item.payer_user_id === secondUserId && item.payee_user_id === firstUserId) {
      secondToFirst += item.amount_yen;
    }
  }

  const net = firstToSecond - secondToFirst;
  if (net > 0) {
    return {
      amountYen: net,
      count: items.length,
      payerUserId: firstUserId,
      payeeUserId: secondUserId
    };
  }

  if (net < 0) {
    return {
      amountYen: Math.abs(net),
      count: items.length,
      payerUserId: secondUserId,
      payeeUserId: firstUserId
    };
  }

  return {
    amountYen: 0,
    count: items.length,
    payerUserId: null,
    payeeUserId: null
  };
}

const localStyles = StyleSheet.create({
  amountGroup: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 10
  },
  amountText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.bold,
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
    maxWidth: 150,
    textAlign: 'right'
  },
  card: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    minHeight: 94,
    padding: 16
  },
  cardPressed: {
    opacity: 0.78
  },
  directionText: {
    color: colors.ink,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 21
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.tint,
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56
  },
  textGroup: {
    flex: 1,
    gap: 3,
    minWidth: 0
  }
});
