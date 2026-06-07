import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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

import { colors, fontFamilies, styles } from '@/src/components/styles';
import { useAuth } from '@/src/context/AuthContext';
import { useLedgerContext } from '@/src/context/LedgerContext';
import { useSyncContext } from '@/src/context/SyncContext';
import { useRequiredLedger } from '@/src/hooks/useRequiredLedger';
import { displayName, formatYen } from '@/src/lib/format';
import {
  getErrorMessage,
  getLedgerMembers,
  getRecurringExpenseRules,
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

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { session, signOut: signOutSession } = useAuth();
  const sync = useSyncContext();
  const { activeLedger, ledgers, loading: ledgersLoading, reloadLedgers, selectLedger } = useLedgerContext();
  const { error, ledger, loading, reloadLedger } = useRequiredLedger();
  const ledgerId = ledger?.id;
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [rules, setRules] = useState<RecurringExpenseRule[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
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
      setRules(nextRules);
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
  const isRefreshing = loading || ledgersLoading || detailsLoading;

  async function refresh() {
    await Promise.all([reloadLedger(), reloadLedgers()]);
    await loadDetails();
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
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
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
        onOpenDetails={() => ledger ? router.push(`/settings/ledger/${ledger.id}`) : undefined}
        onShare={shareInviteCode}
        onSwitch={switchLedger}
        otherLedgers={otherLedgers}
      />

      <FixedExpensesPanel
        activeCount={activeRules.length}
        onOpen={() => router.push('/settings/recurring')}
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
  onOpenDetails: () => void | undefined;
  onShare: () => void;
  onSwitch: (ledgerId: string) => void;
  otherLedgers: LedgerMembership[];
}) {
  const activeColor = colorForId(activeLedger?.ledger.id);

  return (
    <View style={localStyles.panelGroup}>
      <SectionHead
        action={
          <PillButton icon="albums-outline" label="Manage" onPress={onManage} tone="secondary" />
        }
        title="Ledgers"
      />
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
            <Text style={localStyles.switchLabel}>SWITCH TO</Text>
            {otherLedgers.map((membership, index) => (
              <SwitchLedgerRow
                key={membership.ledger.id}
                last={index === otherLedgers.length - 1}
                membership={membership}
                onPress={() => onSwitch(membership.ledger.id)}
              />
            ))}
          </View>
        ) : null}
      </Card>
    </View>
  );
}

function SwitchLedgerRow({
  last,
  membership,
  onPress
}: {
  last: boolean;
  membership: LedgerMembership;
  onPress: () => void;
}) {
  const ledgerColor = colorForId(membership.ledger.id);
  return (
    <View>
      <Pressable onPress={onPress} style={({ pressed }) => [localStyles.switchRow, pressed && localStyles.pressed]}>
        <CircleIcon
          backgroundColor={tintForColor(ledgerColor)}
          color={ledgerColor}
          icon="journal-outline"
          size={38}
        />
        <View style={localStyles.switchText}>
          <Text numberOfLines={1} style={localStyles.switchTitle}>{membership.ledger.name}</Text>
          <Text style={localStyles.switchDescription}>{membership.isOwner ? 'Owner' : 'Member'} · tap to switch</Text>
        </View>
        <CircleIcon backgroundColor="transparent" color={colors.subtle} icon="chevron-forward" size={32} />
      </Pressable>
      {!last ? <View style={localStyles.insetDivider} /> : null}
    </View>
  );
}

function FixedExpensesPanel({
  activeCount,
  onOpen,
  total
}: {
  activeCount: number;
  onOpen: () => void;
  total: number;
}) {
  return (
    <View style={localStyles.panelGroup}>
      <SectionHead
        action={<PillButton icon="add" label="Add" onPress={onOpen} tone="secondary" />}
        title="Fixed Expenses"
      />
      <Card>
        <Pressable onPress={onOpen} style={({ pressed }) => [localStyles.fixedSummary, pressed && localStyles.pressed]}>
          <View>
            <Text style={localStyles.totalLabel}>TOTAL / MONTH</Text>
            <Text style={localStyles.totalValue}>{formatYen(total)}</Text>
          </View>
          <CircleIcon backgroundColor={colors.tint} color={colors.primaryDark} icon="repeat-outline" size={46} />
        </Pressable>
        <View style={localStyles.fullDivider} />
        <DashboardRow
          description={`${activeCount} active ${activeCount === 1 ? 'rule' : 'rules'} · monthly shared expenses`}
          icon="calendar-outline"
          onPress={onOpen}
          title="Manage fixed monthly expenses"
          tone="warm"
        />
      </Card>
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
        <CircleIcon backgroundColor={tintForColor(toneColor)} color={toneColor} icon={icon} size={40} />
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
    <View style={[localStyles.memberChip, { backgroundColor: tintForColor(color) }]}>
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

function tintForColor(color: string | ColorValue) {
  if (color === colors.accent || color === '#6366F1') {
    return 'rgba(99,102,241,0.12)';
  }
  if (color === colors.warm || color === '#C2410C') {
    return 'rgba(194,65,12,0.12)';
  }
  if (color === colors.danger || color === '#DC2626') {
    return 'rgba(220,38,38,0.10)';
  }
  if (color === '#2563EB') {
    return 'rgba(37,99,235,0.12)';
  }
  if (color === '#8B5CF6') {
    return 'rgba(139,92,246,0.12)';
  }
  if (color === '#14B8A6') {
    return 'rgba(20,184,166,0.12)';
  }
  return 'rgba(15,118,110,0.10)';
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
    backgroundColor: colors.tint,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16
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
    borderRadius: 999,
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
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    height: 36,
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
    borderRadius: 999,
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
