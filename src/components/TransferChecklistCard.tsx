import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, styles } from '@/src/components/styles';
import { BentoCard, PillTabs, type PillTabOption } from '@/src/components/ui';
import { displayName, formatYen } from '@/src/lib/format';
import type { TransferConfirmationUpdate } from '@/src/lib/ledger';
import type { LedgerMemberProfile, TransferChecklistItemRow } from '@/src/types/database';

type TransferChecklistMode = 'items' | 'net';

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

const MODE_OPTIONS: PillTabOption<TransferChecklistMode>[] = [
  { label: 'Items', value: 'items' },
  { label: 'Net', value: 'net' }
];

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric'
});

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
  const [mode, setMode] = useState<TransferChecklistMode>('items');
  const nameByUserId = useMemo(() => (
    new Map(members.map((member) => [member.user_id, displayName(member.profile.display_name)]))
  ), [members]);
  const netSummary = useMemo(() => buildNetSummary(items, members), [items, members]);
  const participantItems = useMemo(
    () => items.filter((item) => isParticipant(item, currentUserId)),
    [currentUserId, items]
  );
  const allCurrentConfirmationsDone = participantItems.length > 0 && participantItems.every((item) => (
    Boolean(completedAtForUser(item, currentUserId))
  ));

  function userName(userId: string | null) {
    if (!userId) {
      return 'Both users';
    }

    return nameByUserId.get(userId) || 'Unnamed user';
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

  function toggleNetSummary() {
    if (!currentUserId || saving || participantItems.length === 0) {
      return;
    }

    void onSetConfirmations(participantItems.map((item) => ({
      expense_id: item.expense_id,
      confirmed: !allCurrentConfirmationsDone
    })));
  }

  return (
    <BentoCard style={localStyles.card}>
      <View style={localStyles.header}>
        <View style={localStyles.titleGroup}>
          <Text style={styles.h2}>Transfers</Text>
          {refreshing ? <Text style={styles.muted}>Syncing</Text> : null}
        </View>

        <PillTabs
          accessibilityLabel="Transfer checklist mode"
          onChange={setMode}
          options={MODE_OPTIONS}
          style={localStyles.modeTabs}
          value={mode}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={localStyles.loadingRow}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.muted}>Loading transfers</Text>
        </View>
      ) : null}

      {!loading && items.length === 0 ? (
        <View style={localStyles.emptyState}>
          <Ionicons color={colors.primaryDark} name="checkmark-done-circle-outline" size={24} />
          <Text style={localStyles.emptyTitle}>All transfers settled</Text>
        </View>
      ) : null}

      {!loading && items.length > 0 && mode === 'items' ? (
        <View style={localStyles.list}>
          {items.map((item) => {
            const currentCompleted = Boolean(completedAtForUser(item, currentUserId));
            const counterpartyUserId = counterpartyForUser(item, currentUserId);
            const counterpartyCompleted = Boolean(completedAtForUser(item, counterpartyUserId));
            const canToggle = Boolean(currentUserId && isParticipant(item, currentUserId));

            return (
              <View key={item.expense_id} style={localStyles.itemRow}>
                <ChecklistToggle
                  checked={currentCompleted}
                  disabled={!canToggle || saving}
                  onPress={() => toggleItem(item)}
                />

                <View style={localStyles.itemText}>
                  <View style={localStyles.itemTitleRow}>
                    <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.itemTitle}>
                      {userName(item.payer_user_id)} to {userName(item.payee_user_id)}
                    </Text>
                    <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.itemAmount}>
                      {formatYen(item.amount_yen)}
                    </Text>
                  </View>

                  <Text ellipsizeMode="tail" numberOfLines={1} style={styles.muted}>
                    {item.category} / {formatTransferDate(item.spent_on)}
                  </Text>

                  <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.statusText}>
                    {statusLabel(currentCompleted, counterpartyCompleted, counterpartyUserId, userName)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {!loading && items.length > 0 && mode === 'net' ? (
        <View style={localStyles.netRow}>
          <ChecklistToggle
            checked={allCurrentConfirmationsDone}
            disabled={participantItems.length === 0 || saving}
            onPress={toggleNetSummary}
          />

          <View style={localStyles.itemText}>
            <View style={localStyles.itemTitleRow}>
              <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.itemTitle}>
                {netSummary.amountYen === 0
                  ? 'Net balance'
                  : `${userName(netSummary.payerUserId)} to ${userName(netSummary.payeeUserId)}`}
              </Text>
              <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.netAmount}>
                {formatYen(netSummary.amountYen)}
              </Text>
            </View>

            <Text style={styles.muted}>
              {netSummary.count} open {netSummary.count === 1 ? 'item' : 'items'}
            </Text>

            <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.statusText}>
              {allCurrentConfirmationsDone ? 'Your confirmations are done' : 'Tap to confirm your side'}
            </Text>
          </View>
        </View>
      ) : null}
    </BentoCard>
  );
}

function ChecklistToggle({
  checked,
  disabled,
  onPress
}: {
  checked: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        localStyles.toggle,
        checked && localStyles.toggleChecked,
        disabled && localStyles.toggleDisabled,
        pressed && !disabled && localStyles.togglePressed
      ]}
    >
      {checked ? <Ionicons color="#FFFFFF" name="checkmark" size={18} /> : null}
    </Pressable>
  );
}

function completedAtForUser(item: TransferChecklistItemRow, userId: string | null) {
  if (!userId) {
    return null;
  }

  if (item.payer_user_id === userId) {
    return item.payer_completed_at;
  }

  if (item.payee_user_id === userId) {
    return item.payee_completed_at;
  }

  return null;
}

function counterpartyForUser(item: TransferChecklistItemRow, userId: string | null) {
  if (item.payer_user_id === userId) {
    return item.payee_user_id;
  }

  if (item.payee_user_id === userId) {
    return item.payer_user_id;
  }

  return item.payer_user_id;
}

function isParticipant(item: TransferChecklistItemRow, userId: string | null) {
  return Boolean(userId && (item.payer_user_id === userId || item.payee_user_id === userId));
}

function statusLabel(
  currentCompleted: boolean,
  counterpartyCompleted: boolean,
  counterpartyUserId: string | null,
  userName: (userId: string | null) => string
) {
  if (currentCompleted && counterpartyCompleted) {
    return 'Settled';
  }

  if (currentCompleted) {
    return `Waiting for ${userName(counterpartyUserId)}`;
  }

  if (counterpartyCompleted) {
    return `${userName(counterpartyUserId)} confirmed`;
  }

  return 'Needs both confirmations';
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

function formatTransferDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return dateFormatter.format(new Date(year, month - 1, day));
}

const localStyles = StyleSheet.create({
  card: {
    gap: 14
  },
  emptyState: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 44
  },
  emptyTitle: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  itemAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
    maxWidth: 128,
    textAlign: 'right'
  },
  itemRow: {
    alignItems: 'flex-start',
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12
  },
  itemText: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  itemTitle: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    minWidth: 0
  },
  itemTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  list: {
    gap: 12
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 44
  },
  modeTabs: {
    flex: 1,
    maxWidth: 148,
    minWidth: 128
  },
  netAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    maxWidth: 136,
    textAlign: 'right'
  },
  netRow: {
    alignItems: 'flex-start',
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12
  },
  statusText: {
    color: colors.muted,
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17
  },
  titleGroup: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  toggle: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.subtle,
    borderRadius: 14,
    borderWidth: 2,
    height: 28,
    justifyContent: 'center',
    marginTop: 2,
    width: 28
  },
  toggleChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  toggleDisabled: {
    opacity: 0.58
  },
  togglePressed: {
    transform: [{ scale: 0.94 }]
  }
});
