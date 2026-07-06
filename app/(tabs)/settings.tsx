import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
  type StyleProp,
  type ViewStyle
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { IconButton } from '@/src/components/ui';
import { useAuth } from '@/src/context/AuthContext';
import { useLedgerContext } from '@/src/context/LedgerContext';
import { useSyncContext } from '@/src/context/SyncContext';
import { useRequiredLedger } from '@/src/hooks/useRequiredLedger';
import { categoryColor } from '@/src/lib/categorySystem';
import { tintFromAccent } from '@/src/lib/color';
import { DEFAULT_PARTNER_COLOR } from '@/src/lib/entityColors';
import { displayName, formatYen } from '@/src/lib/format';
import {
  getBudgetTemplates,
  getErrorMessage,
  getExpensesByMonth,
  getLedgerMembers,
  getRecurringExpenseRules,
  updateMyProfile,
  type LedgerMembership
} from '@/src/lib/ledger';
import {
  currentMonthKey,
  filterCurrentMonthSettledExpenses,
  monthEndDateString,
  monthStartDateString
} from '@/src/lib/stats';
import type { BudgetTemplate, LedgerMemberProfile, RecurringExpenseRule } from '@/src/types/database';

type IoniconName = keyof typeof Ionicons.glyphMap;
type ActionTone = 'primary' | 'accent' | 'warm' | 'danger' | 'neutral';

type DashboardRowProps = {
  description: string;
  icon: IoniconName;
  onPress?: () => void;
  showDivider?: boolean;
  title: string;
  tone?: ActionTone;
  trailing?: ReactNode;
};

const LEDGER_COLORS = ['#CB5F43', '#8AA248', '#4F77BE', '#8A6FB6', '#D2A032', '#4E97B5'];

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
  const { activeLedger, ledgers, reloadLedgers } = useLedgerContext();
  const { error, ledger, loading, reloadLedger } = useRequiredLedger();
  const ledgerId = ledger?.id;
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [rules, setRules] = useState<RecurringExpenseRule[]>([]);
  const [budgetTemplates, setBudgetTemplates] = useState<BudgetTemplate[]>([]);
  const [monthSpent, setMonthSpent] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const loadDetails = useCallback(async () => {
    if (!ledgerId) {
      setMembers([]);
      setRules([]);
      setBudgetTemplates([]);
      setMonthSpent(0);
      setDetailsError(null);
      return;
    }

    setDetailsError(null);

    try {
      const userId = session?.user.id || null;
      const monthKey = currentMonthKey();
      const [nextMembers, nextRules, nextBudgetTemplates, nextExpenses] = await Promise.all([
        getLedgerMembers(ledgerId),
        getRecurringExpenseRules(ledgerId, { refreshFirst: true }),
        userId ? getBudgetTemplates(ledgerId, userId, { refreshFirst: true }) : Promise.resolve([]),
        getExpensesByMonth(ledgerId, monthStartDateString(monthKey), monthEndDateString(monthKey), { refreshFirst: true })
      ]);
      const settledExpenses = filterCurrentMonthSettledExpenses({
        expenses: nextExpenses,
        recurringRules: nextRules
      });
      setMembers(nextMembers);
      setRules((currentRules) => preserveExistingRuleOrder(currentRules, nextRules));
      setBudgetTemplates(nextBudgetTemplates);
      setMonthSpent(settledExpenses.reduce((sum, expense) => sum + expense.amount_yen, 0));
    } catch (loadError) {
      setMembers([]);
      setRules([]);
      setBudgetTemplates([]);
      setMonthSpent(0);
      setDetailsError(getErrorMessage(loadError));
    }
  }, [ledgerId, session?.user.id]);

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
  const activeRules = rules.filter((rule) => rule.is_active);
  const recurringTotal = activeRules.reduce((sum, rule) => sum + rule.amount_yen, 0);
  const budgetTotal = budgetTemplates.reduce((sum, template) => sum + template.amount_yen, 0);
  const otherLedgers = ledgers.filter((membership) => membership.ledger.id !== activeLedger?.ledger.id);

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([reloadLedger(), reloadLedgers()]);
      await loadDetails();
    } finally {
      setRefreshing(false);
    }
  }

  async function saveDisplayName(nextName: string) {
    if (!currentUserId || !currentMember) {
      Alert.alert('Save Failed', 'Please wait for your account details to load.');
      return false;
    }

    const normalizedDisplayName = nextName.trim() || 'User';

    try {
      await updateMyProfile(nextName);
      setMembers((current) => current.map((member) => (
        member.user_id === currentUserId
          ? { ...member, profile: { ...member.profile, display_name: normalizedDisplayName } }
          : member
      )));
      return true;
    } catch (saveError) {
      Alert.alert('Save Failed', getErrorMessage(saveError));
      return false;
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

  function openLedgerHub(nextLedgerId: string) {
    router.push({ pathname: '/settings/ledger/[ledgerId]', params: { ledgerId: nextLedgerId } });
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
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      style={localStyles.page}
      contentContainerStyle={[localStyles.content, { paddingTop: insets.top + 28 }]}
    >
      <Text style={localStyles.title}>Settings</Text>

      {error || detailsError ? <Text selectable style={styles.error}>{error || detailsError}</Text> : null}

      <View style={localStyles.panelGroup}>
        <SectionHead title="Account" />
        <AccountCard
          editableName={currentMember?.profile.display_name ?? ''}
          email={accountEmail}
          editingDisabled={!currentMember}
          initials={initials}
          name={accountName}
          onSaveName={saveDisplayName}
          onSignOut={signOut}
        />
      </View>

      <LedgersPanel
        activeLedger={activeLedger}
        budgetTotal={budgetTotal}
        monthSpent={monthSpent}
        onManage={() => router.push('/settings/ledgers')}
        onOpenBudget={() => router.push('/settings/budgets')}
        onOpenFixed={() => router.push('/settings/recurring')}
        onOpenLedger={openLedgerHub}
        otherLedgers={otherLedgers}
        rules={rules}
        recurringTotal={recurringTotal}
      />

      <View style={localStyles.panelGroup}>
        <SectionHead title="App Preferences" />
        <Card>
          <DashboardRow
            description="System"
            icon="language-outline"
            title="Language"
            tone="neutral"
          />
          <DashboardRow
            description={`${sync.pending} pending · ${sync.failed} failed · ${sync.conflict} conflicts`}
            icon="cloud-upload-outline"
            onPress={() => router.push('/settings/sync')}
            showDivider
            title="Sync Status"
            tone={sync.failed || sync.conflict ? 'danger' : 'primary'}
          />
        </Card>
      </View>

      <View style={localStyles.footer}>
        <Text style={localStyles.footerText}>My Ledger v1.0 · JPY</Text>
      </View>
    </ScrollView>
  );
}

function AccountCard({
  editableName,
  editingDisabled,
  email,
  initials,
  name,
  onSaveName,
  onSignOut
}: {
  editableName: string;
  editingDisabled: boolean;
  email: string;
  initials: string;
  name: string;
  onSaveName: (nextName: string) => Promise<boolean>;
  onSignOut: () => void;
}) {
  const [draft, setDraft] = useState(editableName);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  function startEditing() {
    if (editingDisabled) {
      return;
    }
    setDraft(editableName);
    setEditing(true);
  }

  async function saveName() {
    if (saving) {
      return;
    }

    setSaving(true);
    try {
      const saved = await onSaveName(draft);
      if (saved) {
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing() {
    if (saving) {
      return;
    }
    setDraft(editableName);
    setEditing(false);
  }

  return (
    <Card>
      <View style={localStyles.accountRow}>
        <Pressable
          disabled={editing || editingDisabled}
          onPress={startEditing}
          style={({ pressed }) => [
            localStyles.accountPressable,
            editingDisabled && localStyles.disabled,
            pressed && !editingDisabled && localStyles.pressed
          ]}
        >
          <Avatar initials={initials} />
          <View style={localStyles.accountText}>
            {editing ? (
              <TextInput
                autoFocus
                editable={!saving}
                onChangeText={setDraft}
                onSubmitEditing={() => {
                  void saveName();
                }}
                returnKeyType="done"
                style={localStyles.accountNameInput}
                submitBehavior="blurAndSubmit"
                value={draft}
              />
            ) : (
              <View style={localStyles.accountNameRow}>
                <Text numberOfLines={1} style={localStyles.accountName}>{name}</Text>
                {!editingDisabled ? <Ionicons color={colors.subtle} name="pencil-outline" size={14} /> : null}
              </View>
            )}
            <Text numberOfLines={1} selectable style={localStyles.accountEmail}>{email}</Text>
          </View>
        </Pressable>

        {editing ? (
          <View style={localStyles.accountEditActions}>
            <IconButton
              accessibilityLabel="Save display name"
              disabled={saving}
              icon="checkmark"
              onPress={() => {
                void saveName();
              }}
              size="sm"
              tone="primary"
              variant="solid"
            />
            <IconButton
              accessibilityLabel="Cancel display name edit"
              disabled={saving}
              icon="close"
              onPress={cancelEditing}
              size="sm"
              tone="neutral"
            />
          </View>
        ) : (
          <Pressable onPress={onSignOut} style={({ pressed }) => [localStyles.signOutButton, pressed && localStyles.pressed]}>
            <Text style={localStyles.signOutText}>Sign out</Text>
          </Pressable>
        )}
      </View>
    </Card>
  );
}

function LedgersPanel({
  activeLedger,
  budgetTotal,
  monthSpent,
  onManage,
  onOpenBudget,
  onOpenFixed,
  onOpenLedger,
  otherLedgers,
  recurringTotal,
  rules
}: {
  activeLedger: LedgerMembership | null;
  budgetTotal: number;
  monthSpent: number;
  onManage: () => void;
  onOpenBudget: () => void;
  onOpenFixed: () => void;
  onOpenLedger: (ledgerId: string) => void;
  otherLedgers: LedgerMembership[];
  recurringTotal: number;
  rules: RecurringExpenseRule[];
}) {
  const activeColor = colorForId(activeLedger?.ledger.id);
  const activeRules = rules.filter((rule) => rule.is_active);
  const budgetPercent = budgetTotal > 0 ? Math.min(999, Math.round((monthSpent / budgetTotal) * 100)) : 0;

  return (
    <View style={localStyles.panelGroup}>
      <SectionHead title="Ledgers" />
      <Card>
        <View style={localStyles.activeLedger}>
          <Pressable
            disabled={!activeLedger}
            onPress={() => activeLedger ? onOpenLedger(activeLedger.ledger.id) : undefined}
            style={({ pressed }) => [localStyles.activeLedgerHeader, pressed && localStyles.pressed]}
          >
            <CircleIcon backgroundColor={activeColor} color="#FFFFFF" icon="journal" shadowColor={activeColor} size={46} />
            <View style={localStyles.activeLedgerText}>
              <View style={localStyles.activeLabelRow}>
                <Ionicons color={colors.secondary} name="checkmark-circle" size={13} />
                <Text style={localStyles.activeLabel}>ACTIVE LEDGER</Text>
              </View>
              <View style={localStyles.activeNameLine}>
                <Text numberOfLines={1} style={localStyles.activeLedgerName}>
                  {activeLedger?.ledger.name || 'No ledger selected'}
                </Text>
              </View>
            </View>
            <Ionicons color={colors.subtle} name="chevron-forward" size={18} />
          </Pressable>
        </View>

        <ShortcutRow
          amount={formatYen(budgetTotal)}
          icon="wallet-outline"
          iconColor={colors.secondary}
          label="Budget"
          onPress={onOpenBudget}
          progress={budgetTotal > 0 ? Math.min(1, monthSpent / budgetTotal) : 0}
          sublabel={budgetTotal > 0 ? `${budgetPercent}% used` : 'No budget set'}
        />
        <ShortcutRow
          amount={formatYen(recurringTotal)}
          divider
          dots={activeRules.map((rule) => categoryColor(rule.category_id))}
          icon="repeat-outline"
          iconColor={DEFAULT_PARTNER_COLOR}
          label="Fixed Expenses"
          onPress={onOpenFixed}
          sublabel={null}
        />

        <OtherLedgersSummary count={otherLedgers.length} onManage={onManage} />
      </Card>
    </View>
  );
}

function ShortcutRow({
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
  sublabel: string | null;
}) {
  return (
    <View>
      {divider ? <View style={localStyles.insetDivider} /> : null}
      <Pressable onPress={onPress} style={({ pressed }) => [localStyles.shortcutRow, pressed && localStyles.pressed]}>
        <CircleIcon backgroundColor={tintFromAccent(iconColor)} color={iconColor} icon={icon} size={38} />
        <View style={localStyles.shortcutBody}>
          <Text style={localStyles.shortcutTitle}>{label}</Text>
          {typeof progress === 'number' ? (
            <View style={localStyles.progressLine}>
              <View style={localStyles.progressTrack}>
                <View style={[localStyles.progressFill, { width: `${Math.min(1, Math.max(0, progress)) * 100}%` }]} />
              </View>
              {sublabel ? <Text style={localStyles.shortcutSub}>{sublabel}</Text> : null}
            </View>
          ) : (
            <View style={localStyles.dotLine}>
              {dots?.map((dotColor, index) => (
                <View key={`${dotColor}-${index}`} style={[localStyles.categoryDot, { backgroundColor: dotColor }]} />
              ))}
              {sublabel ? <Text style={localStyles.shortcutSub}>{sublabel}</Text> : null}
            </View>
          )}
        </View>
        <Text numberOfLines={1} style={localStyles.shortcutAmount}>{amount}</Text>
        <Ionicons color={colors.subtle} name="chevron-forward" size={17} />
      </Pressable>
    </View>
  );
}

function OtherLedgersSummary({ count, onManage }: { count: number; onManage: () => void }) {
  return (
    <View style={localStyles.otherLedgersSection}>
      <Pressable onPress={onManage} style={({ pressed }) => [localStyles.otherLedgersSummary, pressed && localStyles.pressed]}>
        <CircleIcon backgroundColor="rgba(42,39,34,0.06)" color={colors.ink} icon="albums-outline" size={36} />
        <View style={localStyles.otherLedgersText}>
          <Text style={localStyles.otherLedgersTitle}>Other ledgers</Text>
          <Text numberOfLines={1} style={localStyles.otherLedgersMeta}>
            {count > 0 ? `${count} available in Manage Ledgers` : 'Create or join from Manage Ledgers'}
          </Text>
        </View>
        <Ionicons color={colors.subtle} name="chevron-forward" size={17} />
      </Pressable>
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
  const row = (
    <View style={localStyles.dashboardRow}>
      <CircleIcon backgroundColor={tintFromAccent(toneColor)} color={toneColor} icon={icon} size={40} />
      <View style={localStyles.dashboardText}>
        <Text style={[localStyles.dashboardTitle, tone === 'danger' && localStyles.dangerText]}>{title}</Text>
        <Text numberOfLines={1} style={localStyles.dashboardDescription}>{description}</Text>
      </View>
      {trailing || (onPress ? <Ionicons color={colors.subtle} name="chevron-forward" size={18} /> : null)}
    </View>
  );

  return (
    <View>
      {showDivider ? <View style={localStyles.insetDivider} /> : null}
      {onPress ? (
        <Pressable onPress={onPress} style={({ pressed }) => [pressed && localStyles.pressed]}>
          {row}
        </Pressable>
      ) : row}
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
    return DEFAULT_PARTNER_COLOR;
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
  accountEditActions: {
    flexDirection: 'row',
    gap: 8
  },
  accountName: {
    color: colors.ink,
    flexShrink: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22
  },
  accountNameInput: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 16,
    fontWeight: '700',
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  accountNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minWidth: 0
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
    color: colors.secondary,
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.2,
    lineHeight: 13
  },
  activeLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6
  },
  activeLedger: {
    backgroundColor: 'rgba(192,137,46,0.13)',
    padding: 16
  },
  activeLedgerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12
  },
  activeLedgerName: {
    color: colors.ink,
    flexShrink: 1,
    fontFamily: fontFamilies.extraBold,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22
  },
  activeLedgerText: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  activeNameLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
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
  circleIcon: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  content: {
    alignSelf: 'center',
    gap: 22,
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
    minHeight: 72,
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
  dotLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    minWidth: 0
  },
  footer: {
    alignItems: 'center',
    paddingTop: 2
  },
  footerText: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoBold,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14
  },
  insetDivider: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(42,39,34,0.08)',
    height: StyleSheet.hairlineWidth,
    marginLeft: 62
  },
  otherLedgersMeta: {
    color: colors.subtle,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16
  },
  otherLedgersSection: {
    backgroundColor: 'rgba(42,39,34,0.055)',
    borderTopColor: 'rgba(42,39,34,0.16)',
    borderTopWidth: 1,
    padding: 12
  },
  otherLedgersSummary: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: 'rgba(42,39,34,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 58,
    padding: 11
  },
  otherLedgersText: {
    flex: 1,
    minWidth: 0
  },
  otherLedgersTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18
  },
  page: {
    backgroundColor: colors.bg,
    flex: 1
  },
  panelGroup: {
    gap: 8
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
  sectionHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4
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
  shortcutAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    maxWidth: 96
  },
  shortcutBody: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  shortcutRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  shortcutSub: {
    color: colors.subtle,
    flexShrink: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15
  },
  shortcutTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18
  },
  signOutButton: {
    backgroundColor: 'rgba(192,57,43,0.10)',
    borderRadius: theme.radii.pill,
    paddingHorizontal: 13,
    paddingVertical: 9
  },
  signOutText: {
    color: colors.danger,
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.3,
    lineHeight: 14,
    textTransform: 'uppercase'
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 36,
    paddingHorizontal: 4
  }
});
