import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import {
  completedAtForUser,
  isParticipant
} from '@/src/components/TransferChecklistShared';
import { TransferItemsOverlay } from '@/src/components/TransferItemsOverlay';
import { BentoCard } from '@/src/components/ui';
import { tintFromAccent } from '@/src/lib/color';
import { buildUserColorMap, DEFAULT_USER_COLOR } from '@/src/lib/entityColors';
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
  saving
}: TransferChecklistCardProps) {
  const [overlayVisible, setOverlayVisible] = useState(false);
  const nameByUserId = useMemo(() => (
    new Map(members.map((member) => [member.user_id, displayName(member.profile.display_name)]))
  ), [members]);
  const userColorById = useMemo(() => (
    buildUserColorMap(members.map((member) => member.user_id), currentUserId)
  ), [currentUserId, members]);
  const netSummary = useMemo(() => buildNetSummary(items, members), [items, members]);
  const participantItems = useMemo(() => (
    currentUserId ? items.filter((item) => isParticipant(item, currentUserId)) : []
  ), [currentUserId, items]);
  const allParticipantItemsConfirmed = participantItems.length > 0
    && participantItems.every((item) => completedAtForUser(item, currentUserId));
  const canOpenDetails = items.length > 0 && !loading;
  const canConfirmNet = participantItems.length > 0 && !loading && !saving;

  function userName(userId: string | null) {
    if (!userId) {
      return 'Both users';
    }

    return nameByUserId.get(userId) || 'Unnamed user';
  }

  function userColor(userId: string | null) {
    return userId ? userColorById.get(userId) || DEFAULT_USER_COLOR : DEFAULT_USER_COLOR;
  }

  function directionLabel() {
    return netSummary.count > 0
      ? `${userName(netSummary.payerUserId)} to ${userName(netSummary.payeeUserId)}`
      : 'No unsettled transfer';
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

  function toggleNetConfirmations() {
    if (!canConfirmNet) {
      return;
    }

    const nextConfirmed = !allParticipantItemsConfirmed;
    void onSetConfirmations(participantItems.map((item) => ({
      expense_id: item.expense_id,
      confirmed: nextConfirmed
    })));
  }

  return (
    <>
      <BentoCard style={localStyles.card}>
        <NetConfirmRadio
          checked={allParticipantItemsConfirmed}
          disabled={!canConfirmNet}
          onPress={toggleNetConfirmations}
          saving={saving}
        />

        <Pressable
          accessibilityRole="button"
          disabled={!canOpenDetails}
          onPress={() => setOverlayVisible(true)}
          style={({ pressed }) => [
            localStyles.detailsButton,
            pressed && canOpenDetails && localStyles.cardPressed
          ]}
        >
          <View style={localStyles.detailsContent}>
            <View style={localStyles.textGroup}>
              {loading ? (
                <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.directionText}>
                  Loading transfers
                </Text>
              ) : netSummary.count > 0 ? (
                <>
                  <View style={localStyles.transferDirectionRow}>
                    <UserPill color={userColor(netSummary.payerUserId)} label={userName(netSummary.payerUserId)} />
                    <Text style={localStyles.transferDirectionText}>to</Text>
                    <UserPill color={userColor(netSummary.payeeUserId)} label={userName(netSummary.payeeUserId)} />
                  </View>
                  <Text style={styles.muted}>
                    {netSummary.count} open {netSummary.count === 1 ? 'item' : 'items'}
                  </Text>
                </>
              ) : (
                <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.settledText}>
                  {directionLabel()}
                </Text>
              )}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>

            <View style={localStyles.amountGroup}>
              {loading ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : netSummary.count > 0 ? (
                <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.amountText}>
                  {formatYen(netSummary.amountYen)}
                </Text>
              ) : null}
              {canOpenDetails ? <Ionicons color={colors.ink} name="chevron-forward" size={20} /> : null}
            </View>
          </View>
        </Pressable>
      </BentoCard>

      <TransferItemsOverlay
        currentUserId={currentUserId}
        items={items}
        onClose={() => setOverlayVisible(false)}
        onToggleItem={toggleItem}
        saving={saving}
        userColor={userColor}
        userName={userName}
        visible={overlayVisible}
      />
    </>
  );
}

function UserPill({ color, label }: { color: string; label: string }) {
  return (
    <View style={[
      localStyles.userPill,
      { backgroundColor: tintFromAccent(color) }
    ]}>
      <Text
        ellipsizeMode="tail"
        numberOfLines={1}
        style={[
          localStyles.userPillText,
          { color }
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function NetConfirmRadio({
  checked,
  disabled,
  onPress,
  saving
}: {
  checked: boolean;
  disabled: boolean;
  onPress: () => void;
  saving: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={checked ? 'Unconfirm net transfers' : 'Confirm net transfers'}
      accessibilityRole="radio"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        localStyles.netRadio,
        checked && localStyles.netRadioChecked,
        disabled && localStyles.netRadioDisabled,
        pressed && !disabled && localStyles.netRadioPressed
      ]}
    >
      {saving ? (
        <ActivityIndicator color={colors.primaryDark} size="small" />
      ) : checked ? (
        <View style={localStyles.netRadioDot} />
      ) : null}
    </Pressable>
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
    count: 0,
    payerUserId: null,
    payeeUserId: null
  };
}

const localStyles = StyleSheet.create({
  amountGroup: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 10,
    minWidth: 74
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
    minHeight: 78,
    padding: 16
  },
  cardPressed: {
    opacity: 0.78
  },
  detailsButton: {
    flex: 1,
    minWidth: 0
  },
  detailsContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14
  },
  directionText: {
    color: colors.ink,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 21
  },
  netRadio: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.primaryDark,
    borderRadius: 14,
    borderWidth: 2,
    height: 27,
    justifyContent: 'center',
    width: 27
  },
  netRadioChecked: {
    backgroundColor: colors.tint
  },
  netRadioDisabled: {
    borderColor: colors.line,
    opacity: 0.62
  },
  netRadioDot: {
    backgroundColor: colors.primaryDark,
    borderRadius: 6,
    height: 12,
    width: 12
  },
  netRadioPressed: {
    transform: [{ scale: 0.96 }]
  },
  textGroup: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  settledText: {
    color: colors.muted,
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21
  },
  transferDirectionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
    maxWidth: '100%',
    minWidth: 0
  },
  transferDirectionText: {
    color: colors.muted,
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    flexShrink: 0
  },
  userPill: {
    borderRadius: theme.radii.pill,
    flexShrink: 1,
    maxWidth: '45%',
    minHeight: 22,
    minWidth: 0,
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3
  },
  userPillText: {
    flexShrink: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    lineHeight: 14
  }
});
