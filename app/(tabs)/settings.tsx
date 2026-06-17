import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  type ColorValue,
  type StyleProp,
  type ViewStyle
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { ToggleSwitch } from '@/src/components/ui';
import { useAuth } from '@/src/context/AuthContext';
import { useLedgerContext } from '@/src/context/LedgerContext';
import { useSyncContext } from '@/src/context/SyncContext';
import { useRequiredLedger } from '@/src/hooks/useRequiredLedger';
import { categoryColor, categoryIconName, categoryLabel } from '@/src/lib/categorySystem';
import { tintFromAccent } from '@/src/lib/color';
import { displayName, formatYen } from '@/src/lib/format';
import {
  deleteRecurringGeneratedExpense,
  generateRecurringExpenses,
  getErrorMessage,
  getLedgerMembers,
  getRecurringExpenseRules,
  saveRecurringExpenseRule,
  type LedgerMembership
} from '@/src/lib/ledger';
import type { LedgerMemberProfile, RecurringExpenseRule } from '@/src/types/database';

type IoniconName = keyof typeof Ionicons.glyphMap;

type ActionTone = 'primary' | 'accent' | 'warm' | 'danger' | 'neutral';

type DashboardRowProps = {
  description: string;
  icon: IoniconName;
  onPress: () => void;
  showDivider?: boolean;
  title: string;
  tone?: ActionTone;
  trailing?: ReactNode;
};

const LEDGER_COLORS = ['#0F766E', '#6366F1', '#2563EB', '#C2410C', '#8B5CF6', '#14B8A6'];

function preserveExistingRuleOrder(
  currentRules: RecurringExpenseRule[],
  nextRules: RecurringExpenseRule[]
) {
  if (currentRules.length === 0 || nextRules.length === 0) {
    return nextRules;
  }

  const nextRuleById = new Map(nextRules.map((rule) => [rule.id, rule]));
  const orderedRules = currentRules
    .map((rule) => nextRuleById.get(rule.id))
    .filter((rule): rule is RecurringExpenseRule => Boolean(rule));
  const knownRuleIds = new Set(orderedRules.map((rule) => rule.id));
  const appendedRules = nextRules.filter((rule) => !knownRuleIds.has(rule.id));

  return [...orderedRules, ...appendedRules];
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { session, signOut: signOutSession } = useAuth();
  const sync = useSyncContext();
  const { activeLedger, ledgers, reloadLedgers, selectLedger } = useLedgerContext();
  const { error, ledger, loading, reloadLedger } = useRequiredLedger();
  const ledgerId = ledger?.id;
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [rules, setRules] = useState<RecurringExpenseRule[]>([]);
  const [fixedExpensesExpanded, setFixedExpensesExpanded] = useState(false);
  const [togglingRuleIds, setTogglingRuleIds] = useState<Set<string>>(() => new Set());
  const [, setDetailsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const loadDetails = useCallback(async () => {
    if (!ledgerId) {
      setMembers([]);
      setRules([]);
      setDetailsError(null);
      return;
    }

    setDetailsLoading(true);
    setDetailsError(null);

    try {
      const [nextMembers, nextRules] = await Promise.all([
        getLedgerMembers(ledgerId),
        getRecurringExpenseRules(ledgerId)
      ]);
      setMembers(nextMembers);
      setRules((currentRules) => preserveExistingRuleOrder(currentRules, nextRules));
    } catch (loadError) {
      setMembers([]);
      setRules([]);
      setDetailsError(getErrorMessage(loadError));
    } finally {
      setDetailsLoading(false);
    }
  }, [ledgerId]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  useFocusEffect(useCallback(() => {
    void loadDetails();
  }, [loadDetails]));

  const currentUserId = session?.user.id;
  const currentMember = useMemo(
    () => members.find((member) => member.user_id === currentUserId),
    [currentUserId, members]
  );
  const accountName = displayName(currentMember?.profile.display_name || session?.user.email?.split('@')[0] || 'User');
  const accountEmail = session?.user.email || 'Current session';
  const initials = initialsFor(accountName, accountEmail);
  const memberCount = members.length;
  const activeRules = rules.filter((rule) => rule.is_active);
  const recurringTotal = activeRules.reduce((sum, rule) => sum + rule.amount_yen, 0);
  const otherLedgers = ledgers.filter((membership) => membership.ledger.id !== activeLedger?.ledger.id).slice(0, 2);

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([reloadLedger(), reloadLedgers()]);
      await loadDetails();
    } finally {
      setRefreshing(false);
    }
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

  async function switchLedger(ledgerIdToSelect: string) {
    try {
      await selectLedger(ledgerIdToSelect);
      await reloadLedger();
      await loadDetails();
    } catch (selectError) {
      Alert.alert('Switch Failed', getErrorMessage(selectError));
    }
  }

  async function toggleRecurringRule(rule: RecurringExpenseRule) {
    if (!ledgerId || togglingRuleIds.has(rule.id)) {
      return;
    }

    const nextIsActive = !rule.is_active;
    const previousRules = rules;
    setTogglingRuleIds((current) => new Set(current).add(rule.id));
    setRules((current) => current.map((item) => (
      item.id === rule.id ? { ...item, is_active: nextIsActive } : item
    )));

    try {
      // Recurring rules are saved through the same full-replace path as the editor so offline sync
      // queues one consistent mutation shape. Keep this payload in step with SaveRecurringExpenseRuleInput.
      await saveRecurringExpenseRule({
        id: rule.id,
        ledgerId,
        name: rule.name,
        categoryId: rule.category_id,
        subcategory: rule.subcategory,
        amountYen: rule.amount_yen,
        paidBy: rule.paid_by,
        ownership: rule.ownership || 'shared',
        splitRatioA: rule.split_ratio_a,
        splitRatioB: rule.split_ratio_b,
        splitAmountA: rule.split_amount_a,
        splitAmountB: rule.split_amount_b,
        generateDay: rule.generate_day,
        startMonth: rule.start_month,
        endMonth: rule.end_month,
        timezone: rule.timezone,
        isActive: nextIsActive
      });
      if (nextIsActive) {
        await generateRecurringExpenses(ledgerId).catch(() => []);
      } else {
        await deleteRecurringGeneratedExpense(ledgerId, rule.id).catch(() => {});
      }
      await loadDetails();
    } catch (toggleError) {
      setRules(previousRules);
      Alert.alert('Update Failed', getErrorMessage(toggleError));
    } finally {
      setTogglingRuleIds((current) => {
        const next = new Set(current);
        next.delete(rule.id);
        return next;
      });
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      style={localStyles.page}
      contentContainerStyle={[localStyles.content, { paddingTop: insets.top + 28 }]}
    >
      <Text style={localStyles.title}>Settings</Text>

      {error || detailsError ? <Text style={styles.error}>{error || detailsError}</Text> : null}

      <AccountCard
        email={accountEmail}
        initials={initials}
        name={accountName}
        onEdit={() => router.push('/settings/account')}
        onSignOut={signOut}
      />

      <LedgersPanel
        activeLedger={activeLedger}
        inviteCode={ledger?.invite_code || null}
        memberCount={memberCount}
        members={members}
        onManage={() => router.push('/settings/ledgers')}
        onManageLedger={(id) => router.push(`/settings/ledger/${id}`)}
        onOpenDetails={() => ledger ? router.push(`/settings/ledger/${ledger.id}`) : undefined}
        onShare={shareInviteCode}
        onSwitch={switchLedger}
        otherLedgers={otherLedgers}
      />

      <FixedExpensesPanel
        activeCount={activeRules.length}
        expanded={fixedExpensesExpanded}
        members={members}
        onOpen={() => router.push('/settings/recurring')}
        onOpenRule={(rule) => router.push({ pathname: '/settings/recurring', params: { ruleId: rule.id } })}
        onToggleExpanded={() => setFixedExpensesExpanded((current) => !current)}
        onToggleRule={toggleRecurringRule}
        rules={rules}
        togglingRuleIds={togglingRuleIds}
        total={recurringTotal}
      />

      <Card>
        <DashboardRow
          description={`${sync.pending} pending · ${sync.failed} failed · ${sync.conflict} conflicts`}
          icon="cloud-upload-outline"
          onPress={() => router.push('/settings/sync')}
          title="Sync Status"
          tone={sync.failed || sync.conflict ? 'danger' : 'primary'}
        />
      </Card>

      <View style={localStyles.footer}>
        <Text style={localStyles.footerText}>My Ledger v1.0 · JPY</Text>
      </View>
    </ScrollView>
  );
}

function AccountCard({
  email,
  initials,
  name,
  onEdit,
  onSignOut
}: {
  email: string;
  initials: string;
  name: string;
  onEdit: () => void;
  onSignOut: () => void;
}) {
  return (
    <Card>
      <View style={localStyles.accountRow}>
        <Pressable onPress={onEdit} style={({ pressed }) => [localStyles.accountPressable, pressed && localStyles.pressed]}>
          <Avatar initials={initials} />
          <View style={localStyles.accountText}>
            <Text numberOfLines={1} style={localStyles.accountName}>{name}</Text>
            <Text numberOfLines={1} style={localStyles.accountEmail}>{email}</Text>
          </View>
        </Pressable>

        <Pressable onPress={onSignOut} style={({ pressed }) => [localStyles.signOutButton, pressed && localStyles.pressed]}>
          <View style={localStyles.signOutIcon}>
            <Ionicons color={colors.danger} name="log-out-outline" size={14} />
          </View>
          <Text style={localStyles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function LedgersPanel({
  activeLedger,
  inviteCode,
  memberCount,
  members,
  onManage,
  onManageLedger,
  onOpenDetails,
  onShare,
  onSwitch,
  otherLedgers
}: {
  activeLedger: LedgerMembership | null;
  inviteCode: string | null;
  memberCount: number;
  members: LedgerMemberProfile[];
  onManage: () => void;
  onManageLedger: (ledgerId: string) => void;
  onOpenDetails: () => void | undefined;
  onShare: () => void;
  onSwitch: (ledgerId: string) => void;
  otherLedgers: LedgerMembership[];
}) {
  const activeColor = colorForId(activeLedger?.ledger.id);

  return (
    <View style={localStyles.panelGroup}>
      <SectionHead title="Ledgers" />
      <Card>
        <Pressable
          disabled={!activeLedger}
          onPress={onOpenDetails}
          style={({ pressed }) => [localStyles.activeLedger, pressed && localStyles.pressed]}
        >
          <View style={localStyles.activeLedgerHeader}>
            <CircleIcon backgroundColor={activeColor} color="#FFFFFF" icon="journal" shadowColor={activeColor} size={46} />
            <View style={localStyles.activeLedgerText}>
              <View style={localStyles.activeLabelRow}>
                <Ionicons color={colors.primaryDark} name="checkmark-circle" size={14} />
                <Text style={localStyles.activeLabel}>ACTIVE LEDGER</Text>
              </View>
              <Text numberOfLines={1} style={localStyles.activeLedgerName}>
                {activeLedger?.ledger.name || 'No ledger selected'}
              </Text>
            </View>
            <CircleIcon backgroundColor="rgba(255,255,255,0.72)" color={colors.muted} icon="ellipsis-horizontal" size={34} />
          </View>

          <View style={localStyles.memberChips}>
            {members.slice(0, 3).map((member, index) => (
              <MemberChip
                color={LEDGER_COLORS[index % LEDGER_COLORS.length]}
                key={member.user_id}
                label={displayName(member.profile.display_name).toUpperCase()}
              />
            ))}
            {memberCount === 0 ? <MemberChip color={colors.muted} label="NO MEMBERS" /> : null}
            {memberCount > 3 ? <MemberChip color={colors.muted} label={`+${memberCount - 3}`} /> : null}
          </View>

          <View style={localStyles.inviteRow}>
            <View style={localStyles.inviteCodeBox}>
              <Ionicons color={colors.primaryDark} name="key-outline" size={16} />
              <Text numberOfLines={1} style={localStyles.inviteCode}>
                {inviteCode || 'NO INVITE CODE'}
              </Text>
            </View>
            <PillButton disabled={!inviteCode} icon="share-social-outline" label="Share" onPress={onShare} />
          </View>
        </Pressable>

        {otherLedgers.length > 0 ? (
          <View>
            <View style={localStyles.fullDivider} />
            <Text style={localStyles.switchLabel}>OTHER LEDGERS</Text>
            {otherLedgers.map((membership, index) => (
              <SwitchLedgerRow
                key={membership.ledger.id}
                last={index === otherLedgers.length - 1}
                membership={membership}
                onManage={() => onManageLedger(membership.ledger.id)}
                onSwitch={() => onSwitch(membership.ledger.id)}
              />
            ))}
          </View>
        ) : null}

        <View style={localStyles.fullDivider} />
        <DashboardRow
          description="Create, join, switch, or edit ledgers"
          icon="albums-outline"
          onPress={onManage}
          title="Manage ledgers"
        />
      </Card>
    </View>
  );
}

function SwitchLedgerRow({
  last,
  membership,
  onManage,
  onSwitch
}: {
  last: boolean;
  membership: LedgerMembership;
  onManage: () => void;
  onSwitch: () => void;
}) {
  const ledgerColor = colorForId(membership.ledger.id);
  return (
    <View>
      <View style={localStyles.switchRow}>
        <Pressable onPress={onManage} style={({ pressed }) => [localStyles.switchMain, pressed && localStyles.pressed]}>
          <CircleIcon
            backgroundColor={tintFromAccent(ledgerColor)}
            color={ledgerColor}
            icon="journal-outline"
            size={38}
          />
          <View style={localStyles.switchText}>
            <Text numberOfLines={1} style={localStyles.switchTitle}>{membership.ledger.name}</Text>
            <Text style={localStyles.switchDescription}>{membership.isOwner ? 'Owner' : 'Member'} · tap to manage</Text>
          </View>
        </Pressable>
        <View style={localStyles.switchAction}>
          <PillButton icon="swap-horizontal" label="Switch" onPress={onSwitch} />
        </View>
      </View>
      {!last ? <View style={localStyles.insetDivider} /> : null}
    </View>
  );
}

function FixedExpensesPanel({
  activeCount,
  expanded,
  members,
  onOpen,
  onOpenRule,
  onToggleExpanded,
  onToggleRule,
  rules,
  togglingRuleIds,
  total
}: {
  activeCount: number;
  expanded: boolean;
  members: LedgerMemberProfile[];
  onOpen: () => void;
  onOpenRule: (rule: RecurringExpenseRule) => void;
  onToggleExpanded: () => void;
  onToggleRule: (rule: RecurringExpenseRule) => void;
  rules: RecurringExpenseRule[];
  togglingRuleIds: Set<string>;
  total: number;
}) {
  const inactiveCount = rules.length - activeCount;
  const memberNameById = new Map(members.map((member) => [member.user_id, displayName(member.profile.display_name)]));
  const hasRules = rules.length > 0;

  return (
    <View style={localStyles.panelGroup}>
      <SectionHead title="Fixed Expense" />
      <Card>
        <Pressable
          onPress={hasRules ? onToggleExpanded : onOpen}
          style={({ pressed }) => [
            localStyles.fixedSummary,
            expanded && hasRules ? localStyles.fixedSummaryExpanded : localStyles.fixedSummaryCollapsed,
            pressed && localStyles.pressed
          ]}
        >
          <View style={localStyles.fixedSummaryMain}>
            <Text style={localStyles.totalLabel}>TOTAL / MONTH</Text>
            <Text style={localStyles.totalValue}>{formatYen(total)}</Text>
            <View style={localStyles.fixedPillRow}>
              <InfoPill color={colors.primaryDark} label={`${activeCount} active`} />
              <InfoPill color={inactiveCount > 0 ? colors.muted : colors.primaryDark} label={`${inactiveCount} paused`} />
            </View>
          </View>
          <View style={localStyles.fixedSummaryActions}>
            {hasRules ? (
              <CircleIcon
                backgroundColor="rgba(255,255,255,0.72)"
                color={colors.ink}
                icon={expanded ? 'chevron-up' : 'chevron-down'}
                size={34}
              />
            ) : null}
          </View>
        </Pressable>
        {expanded && hasRules ? (
          <View>
            <View style={localStyles.fullDivider} />
            {rules.map((rule, index) => (
              <FixedExpenseRuleRow
                key={rule.id}
                memberName={memberNameById.get(rule.paid_by) || 'Unknown payer'}
                onPress={() => onOpenRule(rule)}
                onToggle={() => onToggleRule(rule)}
                rule={rule}
                showDivider={index > 0}
                toggling={togglingRuleIds.has(rule.id)}
              />
            ))}
          </View>
        ) : null}

        <View style={localStyles.fullDivider} />
        <DashboardRow
          description="Create and manage monthly fixed expenses"
          icon="add-circle-outline"
          onPress={onOpen}
          title="Add fixed expense"
        />
      </Card>
    </View>
  );
}

function FixedExpenseRuleRow({
  memberName,
  onPress,
  onToggle,
  rule,
  showDivider,
  toggling
}: {
  memberName: string;
  onPress: () => void;
  onToggle: () => void;
  rule: RecurringExpenseRule;
  showDivider: boolean;
  toggling: boolean;
}) {
  const accent = categoryColor(rule.category_id);

  return (
    <View style={[localStyles.fixedRuleSegment, !rule.is_active && localStyles.fixedRuleSegmentPaused]}>
      {showDivider ? <View style={localStyles.fixedRuleDivider} /> : null}
      <View style={localStyles.fixedRuleRow}>
        <Pressable onPress={onPress} style={({ pressed }) => [localStyles.fixedRuleMain, pressed && localStyles.pressed]}>
          <CircleIcon
            backgroundColor={tintFromAccent(accent)}
            color={accent}
            icon={categoryIconName(rule.category_id)}
            size={42}
          />
          <View style={localStyles.fixedRuleBody}>
            <View style={localStyles.fixedRuleTitleRow}>
              <Text numberOfLines={1} style={localStyles.fixedRuleTitle}>{rule.name}</Text>
              <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.fixedRuleAmount}>{formatYen(rule.amount_yen)}</Text>
            </View>
            <View style={localStyles.fixedPillRow}>
              <InfoPill color={accent} label={categoryLabel(rule.category_id)} />
              <InfoPill color={colors.primaryDark} icon="calendar-outline" label={`Day ${rule.generate_day}`} />
            </View>
            <Text numberOfLines={1} style={localStyles.fixedRuleMeta}>
              {rule.ownership === 'personal' ? 'Personal' : 'Shared'} · {memberName} pays{rule.ownership === 'shared' ? ` · ${rule.split_ratio_a}/${rule.split_ratio_b}` : ''}
            </Text>
          </View>
        </Pressable>
        <ToggleSwitch
          accessibilityLabel={rule.is_active ? 'Turn fixed expense inactive' : 'Turn fixed expense active'}
          active={rule.is_active}
          disabled={toggling}
          onPress={onToggle}
        />
      </View>
    </View>
  );
}

function InfoPill({
  color,
  icon,
  label
}: {
  color: string;
  icon?: IoniconName;
  label: string;
}) {
  return (
    <View style={[localStyles.infoPill, { backgroundColor: tintFromAccent(color) }]}>
      {icon ? <Ionicons color={color} name={icon} size={12} /> : <View style={[localStyles.infoPillDot, { backgroundColor: color }]} />}
      <Text numberOfLines={1} style={[localStyles.infoPillText, { color }]}>{label}</Text>
    </View>
  );
}

function DashboardRow({
  description,
  icon,
  onPress,
  showDivider,
  title,
  tone = 'primary',
  trailing
}: DashboardRowProps) {
  const toneColor = colorForTone(tone);
  return (
    <View>
      <Pressable onPress={onPress} style={({ pressed }) => [localStyles.dashboardRow, pressed && localStyles.pressed]}>
        <CircleIcon backgroundColor={tintFromAccent(toneColor)} color={toneColor} icon={icon} size={40} />
        <View style={localStyles.dashboardText}>
          <Text style={[localStyles.dashboardTitle, tone === 'danger' && localStyles.dangerText]}>{title}</Text>
          <Text numberOfLines={1} style={localStyles.dashboardDescription}>{description}</Text>
        </View>
        {trailing || <Ionicons color={colors.subtle} name="chevron-forward" size={18} />}
      </Pressable>
      {showDivider ? <View style={localStyles.insetDivider} /> : null}
    </View>
  );
}

function SectionHead({ action, title }: { action?: ReactNode; title: string }) {
  return (
    <View style={localStyles.sectionHead}>
      <Text style={localStyles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

function PillButton({
  disabled,
  icon,
  label,
  onPress,
  tone = 'primary'
}: {
  disabled?: boolean;
  icon: IoniconName;
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary';
}) {
  const secondary = tone === 'secondary';
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        localStyles.pillButton,
        secondary && localStyles.secondaryPill,
        disabled && localStyles.disabled,
        pressed && !disabled && localStyles.pressed
      ]}
    >
      <Ionicons color={secondary ? colors.primaryDark : '#FFFFFF'} name={icon} size={15} />
      <Text style={[localStyles.pillText, secondary && localStyles.secondaryPillText]}>{label}</Text>
    </Pressable>
  );
}

function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[localStyles.card, style]}>{children}</View>;
}

function Avatar({ initials }: { initials: string }) {
  return (
    <View style={localStyles.avatar}>
      <Text style={localStyles.avatarText}>{initials}</Text>
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

function MemberChip({ color, label }: { color: string; label: string }) {
  return (
    <View style={[localStyles.memberChip, { backgroundColor: tintFromAccent(color) }]}>
      <View style={[localStyles.memberDot, { backgroundColor: color }]} />
      <Text numberOfLines={1} style={[localStyles.memberChipText, { color }]}>{label}</Text>
    </View>
  );
}

function initialsFor(name: string, email: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length > 0) {
    return parts.map((part) => part[0]).join('').toUpperCase();
  }

  return (email[0] || 'U').toUpperCase();
}

function colorForId(id?: string | null) {
  if (!id) {
    return colors.primary;
  }

  const total = Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return LEDGER_COLORS[total % LEDGER_COLORS.length];
}

function colorForTone(tone: ActionTone) {
  if (tone === 'accent') {
    return colors.accent;
  }
  if (tone === 'warm') {
    return colors.warm;
  }
  if (tone === 'danger') {
    return colors.danger;
  }
  if (tone === 'neutral') {
    return colors.ink;
  }
  return colors.primaryDark;
}

const localStyles = StyleSheet.create({
  accountEmail: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18
  },
  accountName: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22
  },
  accountPressable: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 14,
    minWidth: 0
  },
  accountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    padding: 16
  },
  accountText: {
    flex: 1,
    minWidth: 0
  },
  activeLabel: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.extraBold,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    lineHeight: 13
  },
  activeLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4
  },
  activeLedger: {
    backgroundColor: colors.tint,
    gap: 14,
    padding: 16
  },
  activeLedgerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12
  },
  activeLedgerName: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22
  },
  activeLedgerText: {
    flex: 1,
    minWidth: 0
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    width: 50
  },
  avatarText: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.extraBold,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2
  },
  circleIcon: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  content: {
    alignSelf: 'center',
    gap: 24,
    maxWidth: 720,
    padding: 18,
    paddingBottom: 128,
    width: '100%'
  },
  dashboardDescription: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18
  },
  dashboardRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 78,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  dashboardText: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  dashboardTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  dangerText: {
    color: colors.danger
  },
  disabled: {
    opacity: 0.46
  },
  fixedSummary: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    minHeight: 96,
    padding: 16
  },
  fixedSummaryActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8
  },
  fixedSummaryCollapsed: {
    borderRadius: 0
  },
  fixedSummaryExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0
  },
  fixedSummaryMain: {
    flex: 1,
    gap: 8,
    minWidth: 0
  },
  fixedPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7
  },
  fixedRuleAmount: {
    color: colors.ink,
    flexShrink: 0,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    maxWidth: 132,
    textAlign: 'right'
  },
  fixedRuleBody: {
    flex: 1,
    gap: 7,
    minWidth: 0
  },
  fixedRuleDivider: {
    backgroundColor: 'rgba(100,116,139,0.15)',
    height: 1,
    marginLeft: 74
  },
  fixedRuleMeta: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17
  },
  fixedRuleMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 66,
    minWidth: 0
  },
  fixedRuleRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 92,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  fixedRuleSegment: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(100,116,139,0.08)',
    borderLeftWidth: 0,
    borderRightWidth: 0,
    overflow: 'hidden'
  },
  fixedRuleSegmentPaused: {
    opacity: 0.62
  },
  fixedRuleTitle: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    minWidth: 0
  },
  fixedRuleTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minWidth: 0
  },
  footer: {
    alignItems: 'center'
  },
  footerText: {
    color: colors.subtle,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16
  },
  fullDivider: {
    backgroundColor: colors.line,
    height: 1
  },
  insetDivider: {
    backgroundColor: colors.line,
    height: 1,
    marginLeft: 68
  },
  infoPill: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 5,
    maxWidth: '100%',
    minHeight: 24,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  infoPillDot: {
    borderRadius: 3,
    height: 6,
    width: 6
  },
  infoPillText: {
    fontFamily: fontFamilies.bold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 13,
    maxWidth: 150
  },
  inviteCode: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    lineHeight: 18,
    minWidth: 0
  },
  inviteCodeBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    height: 40,
    minWidth: 0,
    paddingHorizontal: 12
  },
  inviteRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10
  },
  memberChip: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  memberChipText: {
    fontFamily: fontFamilies.bold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 14,
    maxWidth: 130
  },
  memberChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  memberDot: {
    borderRadius: 4,
    height: 8,
    width: 8
  },
  page: {
    backgroundColor: colors.bg,
    flex: 1
  },
  panelGroup: {
    gap: 12
  },
  pillButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 6,
    height: 36,
    justifyContent: 'center',
    minWidth: 92,
    paddingHorizontal: 13,
    shadowColor: colors.primary,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 10
  },
  pillText: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14
  },
  pressed: {
    opacity: 0.76
  },
  secondaryPill: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: colors.line,
    borderWidth: 1,
    shadowOpacity: 0
  },
  secondaryPillText: {
    color: colors.primaryDark
  },
  sectionHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4
  },
  sectionTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22
  },
  signOutButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(220,38,38,0.10)',
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 7,
    height: 36,
    paddingLeft: 8,
    paddingRight: 13
  },
  signOutIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    width: 22
  },
  signOutText: {
    color: colors.danger,
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14
  },
  switchAction: {
    flexShrink: 0
  },
  switchDescription: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17
  },
  switchLabel: {
    color: colors.subtle,
    fontFamily: fontFamilies.extraBold,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    lineHeight: 13,
    paddingBottom: 8,
    paddingHorizontal: 16,
    paddingTop: 12
  },
  switchMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    minWidth: 0
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  switchText: {
    flex: 1,
    minWidth: 0
  },
  switchTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
    paddingHorizontal: 4
  },
  totalLabel: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.extraBold,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    lineHeight: 13,
    marginBottom: 8
  },
  totalValue: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 26
  }
});
