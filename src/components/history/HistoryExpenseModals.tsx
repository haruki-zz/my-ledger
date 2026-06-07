import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { IconButton } from '@/src/components/ui';
import { categoryWithSubcategory } from '@/src/lib/categorySystem';
import { formatYen } from '@/src/lib/format';
import type { Expense } from '@/src/types/database';

export type HistoryExpenseItem = {
  displayAmountYen: number;
  expense: Expense;
};

type ProfileDisplayName = (userId: string) => string;

type ExpenseDetailModalProps = {
  formatCreatedAt: (value: string) => string;
  formatHistoryDate: (dateString: string) => string;
  item: HistoryExpenseItem;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onSplit: () => void;
  profileDisplayName: ProfileDisplayName;
};

type SplitBreakdownModalProps = {
  item: HistoryExpenseItem;
  onClose: () => void;
  profileDisplayName: ProfileDisplayName;
};

export function ExpenseDetailModal({
  formatCreatedAt,
  formatHistoryDate,
  item,
  onClose,
  onDelete,
  onEdit,
  onSplit,
  profileDisplayName
}: ExpenseDetailModalProps) {
  const expense = item.expense;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <Pressable onPress={onClose} style={modalStyles.modalBackdrop}>
        <Pressable onPress={(event) => event.stopPropagation()} style={modalStyles.modalCard}>
          <View style={modalStyles.modalHeader}>
            <View style={modalStyles.modalTitleBlock}>
              <Text style={modalStyles.modalKicker}>Expense Details</Text>
              <Text ellipsizeMode="tail" numberOfLines={1} style={modalStyles.modalTitle}>{expenseTitle(expense)}</Text>
            </View>
            <IconButton accessibilityLabel="Close details" icon="close" onPress={onClose} size="md" />
          </View>

          <View style={modalStyles.modalAmountRow}>
            <Text adjustsFontSizeToFit numberOfLines={1} style={modalStyles.modalAmount}>{formatYen(item.displayAmountYen)}</Text>
            <View style={modalStyles.modalOwnershipBadge}>
              <Text style={modalStyles.modalOwnershipText}>{expense.ownership === 'shared' ? 'Shared' : 'Personal'}</Text>
            </View>
          </View>

          <View style={modalStyles.detailGrid}>
            <DetailLine icon="pricetag-outline" label="Category" value={categoryWithSubcategory(expense)} />
            <DetailLine icon="calendar-outline" label="Date" value={formatHistoryDate(expense.spent_on)} />
            {expense.recurring_rule_id ? (
              <DetailLine icon="repeat-outline" label="Source" value="Generated from fixed monthly expense" />
            ) : null}
            <DetailLine icon="time-outline" label="Recorded" value={formatCreatedAt(expense.created_at)} />
            <DetailLine icon="card-outline" label="Paid by" value={profileDisplayName(expense.paid_by)} />
            <DetailLine icon="person-outline" label="Recorded by" value={profileDisplayName(expense.recorded_by)} />
            {expense.note ? <DetailLine icon="document-text-outline" label="Note" value={expense.note} /> : null}
          </View>

          <View style={modalStyles.modalActions}>
            <Pressable onPress={onSplit} style={[styles.button, styles.secondaryButton, modalStyles.modalActionButton]}>
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>Split breakdown</Text>
            </Pressable>
            <Pressable onPress={onEdit} style={[styles.button, styles.secondaryButton, modalStyles.modalActionButton]}>
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>Edit</Text>
            </Pressable>
            <Pressable onPress={onDelete} style={[styles.button, styles.dangerButton, modalStyles.modalActionButton]}>
              <Text style={styles.buttonText}>Delete</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function SplitBreakdownModal({
  item,
  onClose,
  profileDisplayName
}: SplitBreakdownModalProps) {
  const expense = item.expense;
  const rows = expense.ownership === 'shared' && expense.splits.length > 0
    ? expense.splits
    : [{ amount_yen: expense.amount_yen, expense_id: expense.id, user_id: expense.paid_by }];

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <Pressable onPress={onClose} style={modalStyles.modalBackdrop}>
        <Pressable onPress={(event) => event.stopPropagation()} style={modalStyles.modalCard}>
          <View style={modalStyles.modalHeader}>
            <View style={modalStyles.modalTitleBlock}>
              <Text style={modalStyles.modalKicker}>Split Breakdown</Text>
              <Text ellipsizeMode="tail" numberOfLines={1} style={modalStyles.modalTitle}>{expenseTitle(expense)}</Text>
            </View>
            <IconButton accessibilityLabel="Close split breakdown" icon="close" onPress={onClose} size="md" />
          </View>

          <View style={modalStyles.splitTotalRow}>
            <Text style={modalStyles.splitTotalLabel}>Total</Text>
            <Text adjustsFontSizeToFit numberOfLines={1} style={modalStyles.splitTotalAmount}>{formatYen(expense.amount_yen)}</Text>
          </View>

          <View style={modalStyles.splitRows}>
            {rows
              .slice()
              .sort((a, b) => profileDisplayName(a.user_id).localeCompare(profileDisplayName(b.user_id)))
              .map((split) => {
                const percentage = expense.amount_yen > 0 ? Math.round((split.amount_yen / expense.amount_yen) * 100) : 0;
                return (
                  <View key={split.user_id} style={modalStyles.splitRow}>
                    <View style={modalStyles.splitUserBlock}>
                      <Text ellipsizeMode="tail" numberOfLines={1} style={modalStyles.splitUserName}>
                        {profileDisplayName(split.user_id)}
                      </Text>
                      <Text style={modalStyles.splitPercent}>{percentage}%</Text>
                    </View>
                    <Text adjustsFontSizeToFit numberOfLines={1} style={modalStyles.splitAmount}>
                      {formatYen(split.amount_yen)}
                    </Text>
                  </View>
                );
              })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DetailLine({
  icon,
  label,
  value
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={modalStyles.detailLine}>
      <View style={modalStyles.detailLineIcon}>
        <Ionicons color={colors.primaryDark} name={icon} size={18} />
      </View>
      <View style={modalStyles.detailLineText}>
        <Text style={modalStyles.detailLineLabel}>{label}</Text>
        <Text style={modalStyles.detailLineValue}>{value}</Text>
      </View>
    </View>
  );
}

function expenseTitle(expense: Expense) {
  return expense.note?.trim() || categoryWithSubcategory(expense);
}

const modalStyles = StyleSheet.create({
  detailGrid: {
    gap: 10
  },
  detailLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10
  },
  detailLineIcon: {
    alignItems: 'center',
    backgroundColor: colors.tint,
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 34
  },
  detailLineLabel: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    lineHeight: 14,
    textTransform: 'uppercase'
  },
  detailLineText: {
    flex: 1,
    gap: 1,
    minWidth: 0
  },
  detailLineValue: {
    color: colors.ink,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20
  },
  modalActionButton: {
    flex: 1,
    minWidth: 96
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  modalAmount: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 40,
    minWidth: 0
  },
  modalAmountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(23,32,42,0.34)',
    flex: 1,
    justifyContent: 'center',
    padding: 20
  },
  modalCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: colors.glassBorder,
    borderRadius: theme.radii.surface,
    borderWidth: 1,
    gap: 18,
    maxWidth: 520,
    padding: 18,
    width: '100%',
    ...theme.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 30
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  modalKicker: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.bold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    lineHeight: 15,
    textTransform: 'uppercase'
  },
  modalOwnershipBadge: {
    backgroundColor: colors.tint,
    borderColor: 'rgba(15,118,110,0.16)',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  modalOwnershipText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16
  },
  modalTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 25
  },
  modalTitleBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  splitAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    maxWidth: 132,
    textAlign: 'right'
  },
  splitPercent: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17
  },
  splitRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,118,110,0.06)',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  splitRows: {
    gap: 8
  },
  splitTotalAmount: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.bold,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    maxWidth: 180,
    textAlign: 'right'
  },
  splitTotalLabel: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    lineHeight: 16,
    textTransform: 'uppercase'
  },
  splitTotalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  splitUserBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  splitUserName: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20
  }
});
