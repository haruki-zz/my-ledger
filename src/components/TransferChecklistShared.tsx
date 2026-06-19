import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { tintFromAccent } from '@/src/lib/color';
import { categoryWithSubcategory } from '@/src/lib/categorySystem';
import { DEFAULT_USER_COLOR } from '@/src/lib/entityColors';
import { formatYen } from '@/src/lib/format';
import type { TransferChecklistItemRow } from '@/src/types/database';

const STACK_CARD_MIN_HEIGHT = 112;
export const TRANSFER_OVERLAY_MAX_WIDTH = 1040;
const noop = () => undefined;

export type TransferItemCardProps = {
  canToggle: boolean;
  children?: React.ReactNode;
  currentCompleted: boolean;
  item: TransferChecklistItemRow;
  onToggle?: () => void;
  saving: boolean;
  showToggle: boolean;
  userColor?: (userId: string | null) => string;
  userName: (userId: string | null) => string;
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric'
});

export function TransferItemCard({
  canToggle,
  children,
  currentCompleted,
  item,
  onToggle,
  saving,
  showToggle,
  userColor = defaultUserColor,
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
          <View style={sharedStyles.transferUsersRow}>
            <TransferUserPill color={userColor(item.payer_user_id)} label={userName(item.payer_user_id)} />
            <Text style={sharedStyles.transferDirectionText}>to</Text>
            <TransferUserPill color={userColor(item.payee_user_id)} label={userName(item.payee_user_id)} />
          </View>
          <Text numberOfLines={1} style={sharedStyles.itemAmount}>
            {formatYen(item.amount_yen)}
          </Text>
        </View>

        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.muted}>
          {categoryWithSubcategory(item)} / {formatTransferDate(item.spent_on)}
        </Text>
      </View>
    </View>
  );
}

function TransferUserPill({ color, label }: { color: string; label: string }) {
  return (
    <View style={[sharedStyles.transferUserPill, { backgroundColor: tintFromAccent(color) }]}>
      <Text ellipsizeMode="tail" numberOfLines={1} style={[sharedStyles.transferUserPillText, { color }]}>
        {label}
      </Text>
    </View>
  );
}

function ChecklistToggle({
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

export function isParticipant(item: TransferChecklistItemRow, userId: string | null) {
  return Boolean(userId && (item.payer_user_id === userId || item.payee_user_id === userId));
}

function formatTransferDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return dateFormatter.format(new Date(year, month - 1, day));
}

function defaultUserColor() {
  return DEFAULT_USER_COLOR;
}

const sharedStyles = StyleSheet.create({
  itemAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    flexShrink: 0,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    minWidth: 104,
    textAlign: 'right'
  },
  itemText: {
    flex: 1,
    gap: 3,
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
  },
  transferDirectionText: {
    color: colors.muted,
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18
  },
  transferUserPill: {
    borderRadius: theme.radii.pill,
    maxWidth: 112,
    minHeight: 22,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  transferUserPillText: {
    fontFamily: fontFamilies.bold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 15
  },
  transferUsersRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minWidth: 0
  }
});
