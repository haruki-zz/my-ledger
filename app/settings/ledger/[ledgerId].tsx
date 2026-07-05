import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type ColorValue
} from 'react-native';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { useAuth } from '@/src/context/AuthContext';
import { useLedgerContext } from '@/src/context/LedgerContext';
import { categoryColor } from '@/src/lib/categorySystem';
import { tintFromAccent } from '@/src/lib/color';
import { DEFAULT_PARTNER_COLOR } from '@/src/lib/entityColors';
import { formatYen } from '@/src/lib/format';
import {
  getBudgetTemplates,
  getErrorMessage,
  getExpensesByMonth,
  getLedgerMembers,
  getRecurringExpenseRules
} from '@/src/lib/ledger';
import {
  currentMonthKey,
  filterCurrentMonthSettledExpenses,
  monthEndDateString,
  monthStartDateString
} from '@/src/lib/stats';
import type { BudgetTemplate, LedgerMemberProfile, RecurringExpenseRule } from '@/src/types/database';

type IoniconName = keyof typeof Ionicons.glyphMap;

const LEDGER_COLORS = ['#CB5F43', '#8AA248', '#4F77BE', '#8A6FB6', '#D2A032', '#4E97B5'];

export default function LedgerHubScreen() {
  const params = useLocalSearchParams<{ ledgerId?: string | string[] }>();
  const { session } = useAuth();
  const {
    activeLedger,
    deleteLedger,
    leaveLedger,
    ledgers,
    reloadLedgers,
    selectLedger
  } = useLedgerContext();
  const selectedLedgerId = Array.isArray(params.ledgerId) ? params.ledgerId[0] : params.ledgerId;
  const membership = useMemo(() => (
    ledgers.find((item) => item.ledger.id === selectedLedgerId) || null
  ), [ledgers, selectedLedgerId]);
  const isActive = Boolean(membership && activeLedger?.ledger.id === membership.ledger.id);
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [rules, setRules] = useState<RecurringExpenseRule[]>([]);
  const [budgetTemplates, setBudgetTemplates] = useState<BudgetTemplate[]>([]);
  const [monthSpent, setMonthSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ledger = membership?.ledger || null;
  const activeRules = rules.filter((rule) => rule.is_active);
  const budgetTotal = budgetTemplates.reduce((sum, template) => sum + template.amount_yen, 0);
  const fixedTotal = activeRules.reduce((sum, rule) => sum + rule.amount_yen, 0);
  const budgetPercent = budgetTotal > 0 ? Math.min(999, Math.round((monthSpent / budgetTotal) * 100)) : 0;
  const ledgerColor = colorForId(ledger?.id);

  const loadDetails = useCallback(async (options?: { refreshing?: boolean }) => {
    if (!membership || !session?.user.id) {
      setMembers([]);
      setRules([]);
      setBudgetTemplates([]);
      setMonthSpent(0);
      setLoading(false);
      return;
    }

    setError(null);
    setLoading((current) => current && !options?.refreshing);
    setRefreshing(Boolean(options?.refreshing));

    try {
      const monthKey = currentMonthKey();
      const [nextMembers, nextRules, nextBudgetTemplates, nextExpenses] = await Promise.all([
        getLedgerMembers(membership.ledger.id),
        getRecurringExpenseRules(membership.ledger.id, { refreshFirst: true }),
        getBudgetTemplates(membership.ledger.id, session.user.id, { refreshFirst: true }),
        getExpensesByMonth(membership.ledger.id, monthStartDateString(monthKey), monthEndDateString(monthKey), { refreshFirst: true })
      ]);
      const settledExpenses = filterCurrentMonthSettledExpenses({
        expenses: nextExpenses,
        recurringRules: nextRules
      });
      setMembers(nextMembers);
      setRules(nextRules);
      setBudgetTemplates(nextBudgetTemplates);
      setMonthSpent(settledExpenses.reduce((sum, expense) => sum + expense.amount_yen, 0));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [membership, session?.user.id]);

  useFocusEffect(useCallback(() => {
    void loadDetails();
  }, [loadDetails]));

  async function setAsActive() {
    if (!membership || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await selectLedger(membership.ledger.id);
      await reloadLedgers(membership.ledger.id);
    } catch (selectError) {
      Alert.alert('Switch Failed', getErrorMessage(selectError));
    } finally {
      setSubmitting(false);
    }
  }

  async function openScopedRoute(pathname: '/settings/budgets' | '/settings/recurring') {
    if (!membership) {
      return;
    }

    if (!isActive) {
      setSubmitting(true);
      try {
        await selectLedger(membership.ledger.id);
        await reloadLedgers(membership.ledger.id);
      } catch (selectError) {
        Alert.alert('Switch Failed', getErrorMessage(selectError));
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
    }

    router.push(pathname);
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

  function confirmDangerAction() {
    if (!membership) {
      return;
    }

    const destructiveLabel = membership.isOwner ? 'Delete Ledger' : 'Leave Ledger';
    const message = membership.isOwner
      ? `After deleting "${membership.ledger.name}", the ledger, expense history, categories, and member-visible data will be permanently deleted.`
      : `After leaving "${membership.ledger.name}", you will no longer be able to view this ledger. Settle all shared transfer items first.`;

    Alert.alert(destructiveLabel, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: membership.isOwner ? 'Delete' : 'Leave',
        style: 'destructive',
        onPress: () => {
          void runDangerAction();
        }
      }
    ]);
  }

  async function runDangerAction() {
    if (!membership || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      if (membership.isOwner) {
        await deleteLedger(membership.ledger.id);
      } else {
        await leaveLedger(membership.ledger.id);
      }
      router.replace('/settings/ledgers');
    } catch (dangerError) {
      Alert.alert('Update Failed', getErrorMessage(dangerError));
    } finally {
      setSubmitting(false);
    }
  }

  if (!membership && loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!membership || !ledger) {
    return (
      <View style={[styles.center, localStyles.centerState]}>
        <Ionicons color={colors.muted} name="alert-circle-outline" size={30} />
        <Text selectable style={styles.error}>Ledger not found.</Text>
        <Pressable onPress={() => router.replace('/settings/ledgers')} style={localStyles.secondaryButton}>
          <Text style={localStyles.secondaryButtonText}>Back to ledgers</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadDetails({ refreshing: true })} />}
      style={styles.page}
      contentContainerStyle={localStyles.content}
    >
      {error ? <Text selectable style={styles.error}>{error}</Text> : null}

      <View style={localStyles.headerCard}>
        <CircleIcon
          backgroundColor={ledgerColor}
          color="#FFFFFF"
          icon="journal"
          shadowColor={ledgerColor}
          size={54}
        />
        <View style={localStyles.headerText}>
          <View style={localStyles.headerTitleLine}>
            <Text numberOfLines={1} style={localStyles.headerTitle}>{ledger.name}</Text>
            {isActive ? <ActiveBadge /> : null}
          </View>
        </View>
      </View>

      {!isActive ? (
        <Pressable
          disabled={submitting}
          onPress={() => {
            void setAsActive();
          }}
          style={({ pressed }) => [localStyles.setActiveButton, submitting && localStyles.disabled, pressed && !submitting && localStyles.pressed]}
        >
          <Ionicons color="#FFFFFF" name="checkmark-circle-outline" size={18} />
          <Text style={localStyles.setActiveText}>{submitting ? 'Switching...' : 'Set as active ledger'}</Text>
        </Pressable>
      ) : null}

      <View style={localStyles.card}>
        <SummaryRow
          amount={formatYen(budgetTotal)}
          icon="wallet-outline"
          iconColor={colors.secondary}
          label="Budget"
          onPress={() => {
            void openScopedRoute('/settings/budgets');
          }}
          progress={budgetTotal > 0 ? Math.min(1, monthSpent / budgetTotal) : 0}
          sublabel={budgetTotal > 0 ? `${budgetPercent}% used` : 'No budget set'}
        />
        <SummaryRow
          amount={formatYen(fixedTotal)}
          divider
          dots={activeRules.map((rule) => categoryColor(rule.category_id))}
          icon="repeat-outline"
          iconColor={DEFAULT_PARTNER_COLOR}
          label="Fixed Expenses"
          onPress={() => {
            void openScopedRoute('/settings/recurring');
          }}
          sublabel={`${activeRules.length} active`}
        />
      </View>

      <InviteCodeLine inviteCode={ledger.invite_code} onShare={shareInviteCode} />

      <View style={localStyles.dangerSection}>
        <Text style={localStyles.sectionTitle}>Danger Zone</Text>
        <Pressable
          disabled={submitting}
          onPress={confirmDangerAction}
          style={({ pressed }) => [localStyles.dangerButton, submitting && localStyles.disabled, pressed && !submitting && localStyles.pressed]}
        >
          <Ionicons color={colors.danger} name={membership.isOwner ? 'trash-outline' : 'log-out-outline'} size={17} />
          <Text style={localStyles.dangerText}>{membership.isOwner ? 'Delete Ledger' : 'Leave Ledger'}</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator /> : null}
      <Text style={localStyles.metaText}>{members.length} member{members.length === 1 ? '' : 's'}</Text>
    </ScrollView>
  );
}

function SummaryRow({
  amount,
  divider,
  dots,
  icon,
  iconColor,
  label,
  onPress,
  progress,
  sublabel
}: {
  amount: string;
  divider?: boolean;
  dots?: string[];
  icon: IoniconName;
  iconColor: string;
  label: string;
  onPress: () => void;
  progress?: number;
  sublabel: string;
}) {
  return (
    <View>
      {divider ? <View style={localStyles.insetDivider} /> : null}
      <Pressable onPress={onPress} style={({ pressed }) => [localStyles.summaryRow, pressed && localStyles.pressed]}>
        <CircleIcon backgroundColor={tintFromAccent(iconColor)} color={iconColor} icon={icon} size={38} />
        <View style={localStyles.summaryBody}>
          <Text style={localStyles.summaryTitle}>{label}</Text>
          {typeof progress === 'number' ? (
            <View style={localStyles.progressLine}>
              <View style={localStyles.progressTrack}>
                <View style={[localStyles.progressFill, { width: `${Math.min(1, Math.max(0, progress)) * 100}%` }]} />
              </View>
              <Text style={localStyles.summarySub}>{sublabel}</Text>
            </View>
          ) : (
            <View style={localStyles.dotLine}>
              {dots?.slice(0, 7).map((dotColor, index) => (
                <View key={`${dotColor}-${index}`} style={[localStyles.categoryDot, { backgroundColor: dotColor }]} />
              ))}
              <Text style={localStyles.summarySub}>{sublabel}</Text>
            </View>
          )}
        </View>
        <Text numberOfLines={1} style={localStyles.summaryAmount}>{amount}</Text>
        <Ionicons color={colors.subtle} name="chevron-forward" size={17} />
      </Pressable>
    </View>
  );
}

function InviteCodeLine({ inviteCode, onShare }: { inviteCode: string; onShare: () => void }) {
  return (
    <View style={localStyles.inviteSlimRow}>
      <Text style={localStyles.inviteCaption}>CODE</Text>
      <Text numberOfLines={1} selectable style={localStyles.inviteCode}>{inviteCode}</Text>
      <Pressable
        accessibilityLabel="Share invite code"
        onPress={onShare}
        style={({ pressed }) => [localStyles.copyButton, pressed && localStyles.pressed]}
      >
        <Ionicons color={colors.muted} name="copy-outline" size={14} />
      </Pressable>
    </View>
  );
}

function ActiveBadge() {
  return (
    <View style={localStyles.activeBadge}>
      <Text style={localStyles.activeBadgeText}>Active</Text>
    </View>
  );
}

function CircleIcon({
  backgroundColor,
  color,
  icon,
  shadowColor,
  size
}: {
  backgroundColor: ColorValue;
  color: ColorValue;
  icon: IoniconName;
  shadowColor?: string;
  size: number;
}) {
  return (
    <View
      style={[
        localStyles.circleIcon,
        {
          backgroundColor,
          borderRadius: size / 2,
          height: size,
          width: size
        },
        shadowColor ? { shadowColor, shadowOffset: { height: 5, width: 0 }, shadowOpacity: 0.26, shadowRadius: 12 } : null
      ]}
    >
      <Ionicons color={color} name={icon} size={Math.round(size * 0.46)} />
    </View>
  );
}

function colorForId(id?: string | null) {
  if (!id) {
    return colors.primary;
  }

  const total = Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return LEDGER_COLORS[total % LEDGER_COLORS.length];
}

const localStyles = StyleSheet.create({
  activeBadge: {
    backgroundColor: colors.primary,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  activeBadgeText: {
    color: '#FFFDF7',
    fontFamily: fontFamilies.extraBold,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 13
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#2A2722',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 22
  },
  categoryDot: {
    borderRadius: 2.5,
    height: 5,
    width: 5
  },
  centerState: {
    gap: 12
  },
  circleIcon: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  content: {
    alignSelf: 'center',
    gap: 14,
    maxWidth: 720,
    padding: 18,
    paddingBottom: 44,
    width: '100%'
  },
  copyButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(42,39,34,0.05)',
    borderRadius: 8,
    height: 28,
    justifyContent: 'center',
    width: 28
  },
  dangerButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(192,57,43,0.10)',
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 46
  },
  dangerSection: {
    gap: 8
  },
  dangerText: {
    color: colors.danger,
    fontFamily: fontFamilies.extraBold,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18
  },
  disabled: {
    opacity: 0.45
  },
  dotLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    minWidth: 0
  },
  headerCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(192,137,46,0.13)',
    borderColor: 'rgba(192,137,46,0.20)',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    padding: 16
  },
  headerText: {
    flex: 1,
    minWidth: 0
  },
  headerTitle: {
    color: colors.ink,
    flexShrink: 1,
    fontFamily: fontFamilies.extraBold,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 27
  },
  headerTitleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    minWidth: 0
  },
  insetDivider: {
    backgroundColor: 'rgba(42,39,34,0.08)',
    height: StyleSheet.hairlineWidth,
    marginLeft: 62
  },
  inviteCaption: {
    color: '#B7AD9E',
    fontFamily: fontFamilies.monoBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    lineHeight: 14
  },
  inviteCode: {
    color: colors.subtle,
    flex: 1,
    fontFamily: fontFamilies.monoBold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    minWidth: 0
  },
  inviteSlimRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  metaText: {
    alignSelf: 'center',
    color: colors.subtle,
    fontFamily: fontFamilies.monoBold,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    textTransform: 'uppercase'
  },
  pressed: {
    opacity: 0.7
  },
  progressFill: {
    backgroundColor: colors.secondary,
    borderRadius: 999,
    height: '100%'
  },
  progressLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minWidth: 0
  },
  progressTrack: {
    backgroundColor: 'rgba(42,39,34,0.08)',
    borderRadius: 999,
    height: 5,
    overflow: 'hidden',
    width: 76
  },
  secondaryButton: {
    backgroundColor: 'rgba(42,39,34,0.05)',
    borderRadius: theme.radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  secondaryButtonText: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 13,
    fontWeight: '800'
  },
  sectionTitle: {
    color: colors.muted,
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    lineHeight: 16,
    textTransform: 'uppercase'
  },
  setActiveButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 48
  },
  setActiveText: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.extraBold,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18
  },
  summaryAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    maxWidth: 96
  },
  summaryBody: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  summarySub: {
    color: colors.subtle,
    flexShrink: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15
  },
  summaryTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18
  }
});
