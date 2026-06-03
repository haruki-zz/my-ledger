import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { formatYen } from '@/src/lib/format';
import type { TransferChecklistItemRow } from '@/src/types/database';

export const STACK_CARD_MIN_HEIGHT = 112;
export const TRANSFER_OVERLAY_MAX_WIDTH = 1040;
const noop = () => undefined;

export type TransferItemCardProps = {
  canToggle: boolean;
  children?: React.ReactNode;
  counterpartyCompleted: boolean;
  counterpartyUserId: string | null;
  currentCompleted: boolean;
  item: TransferChecklistItemRow;
  onToggle?: () => void;
  saving: boolean;
  showToggle: boolean;
  userName: (userId: string | null) => string;
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric'
});

export function TransferItemCard({
  canToggle,
  children,
  counterpartyCompleted,
  counterpartyUserId,
  currentCompleted,
  item,
  onToggle,
  saving,
  showToggle,
  userName
}: TransferItemCardProps) {
  return (
    <View style={[sharedStyles.transferCard, children ? sharedStyles.previewTransferCard : null]}>
      {children}
      {showToggle ? (
        <ChecklistToggle
          checked={currentCompleted}
          disabled={!canToggle || saving}
          onPress={onToggle || noop}
        />
      ) : null}

      <View style={sharedStyles.itemText}>
        <View style={sharedStyles.itemTitleRow}>
          <Text ellipsizeMode="tail" numberOfLines={1} style={sharedStyles.itemTitle}>
            {userName(item.payer_user_id)} to {userName(item.payee_user_id)}
          </Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={sharedStyles.itemAmount}>
            {formatYen(item.amount_yen)}
          </Text>
        </View>

        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.muted}>
          {item.category} / {formatTransferDate(item.spent_on)}
        </Text>

        <Text ellipsizeMode="tail" numberOfLines={1} style={sharedStyles.statusText}>
          {statusLabel(currentCompleted, counterpartyCompleted, counterpartyUserId, userName)}
        </Text>
      </View>
    </View>
  );
}

export function ChecklistToggle({
  checked,
  disabled,
  onPress,
  style
}: {
  checked: boolean;
  disabled: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        sharedStyles.toggle,
        checked && sharedStyles.toggleChecked,
        disabled && sharedStyles.toggleDisabled,
        pressed && !disabled && sharedStyles.togglePressed,
        style
      ]}
    >
      {checked ? <Ionicons color="#FFFFFF" name="checkmark" size={18} /> : null}
    </Pressable>
  );
}

export function completedAtForUser(item: TransferChecklistItemRow, userId: string | null) {
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

export function counterpartyForUser(item: TransferChecklistItemRow, userId: string | null) {
  if (item.payer_user_id === userId) {
    return item.payee_user_id;
  }

  if (item.payee_user_id === userId) {
    return item.payer_user_id;
  }

  return item.payer_user_id;
}

export function isParticipant(item: TransferChecklistItemRow, userId: string | null) {
  return Boolean(userId && (item.payer_user_id === userId || item.payee_user_id === userId));
}

export function statusLabel(
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

function formatTransferDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return dateFormatter.format(new Date(year, month - 1, day));
}

export const sharedStyles = StyleSheet.create({
  itemAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    maxWidth: 128,
    textAlign: 'right'
  },
  itemText: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  itemTitle: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    minWidth: 0
  },
  itemTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  previewTransferCard: {
    paddingTop: 36
  },
  statusText: {
    color: colors.muted,
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17
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
  },
  transferCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: STACK_CARD_MIN_HEIGHT,
    padding: 14,
    paddingTop: 18,
    ...theme.shadow
  }
});
