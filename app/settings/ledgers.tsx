import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue
} from 'react-native';

import { KEYBOARD_DONE_ACCESSORY_ID } from '@/src/components/KeyboardDoneAccessory';
import { KeyboardAwareScrollView } from '@/src/components/KeyboardAwareScrollView';
import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { useAuth } from '@/src/context/AuthContext';
import { useLedgerContext } from '@/src/context/LedgerContext';
import { displayName } from '@/src/lib/format';
import { runAfterKeyboardDismiss } from '@/src/lib/keyboard';
import { getErrorMessage, getLedgerMembers, type LedgerMembership } from '@/src/lib/ledger';
import { tintFromAccent } from '@/src/lib/color';
import type { LedgerMemberProfile } from '@/src/types/database';

type IoniconName = keyof typeof Ionicons.glyphMap;

type LedgerMemberState = {
  error: string | null;
  loading: boolean;
  members: LedgerMemberProfile[];
};

type LedgerAction = 'create' | 'join' | `switch:${string}` | `delete:${string}` | `leave:${string}`;

const DEFAULT_LEDGER_NAME = 'Shared Ledger';
const LEDGER_COLORS = ['#0F766E', '#6366F1', '#2563EB', '#C2410C', '#8B5CF6', '#14B8A6'];

export default function LedgerManagementScreen() {
  const { session } = useAuth();
  const {
    activeLedger,
    createAndSelect,
    deleteLedger,
    error: ledgerError,
    joinAndSelect,
    leaveLedger,
    ledgers,
    loading,
    reloadLedgers,
    selectLedger
  } = useLedgerContext();
  const [ledgerName, setLedgerName] = useState(DEFAULT_LEDGER_NAME);
  const [inviteCode, setInviteCode] = useState('');
  const [submittingAction, setSubmittingAction] = useState<LedgerAction | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberStateByLedgerId, setMemberStateByLedgerId] = useState<Record<string, LedgerMemberState>>({});

  const activeLedgerId = activeLedger?.ledger.id || null;
  const currentLedger = ledgers.find((membership) => membership.ledger.id === activeLedgerId) || null;
  const otherLedgers = ledgers.filter((membership) => membership.ledger.id !== activeLedgerId);
  const memberErrorCount = useMemo(
    () => Object.values(memberStateByLedgerId).filter((state) => state.error).length,
    [memberStateByLedgerId]
  );

  const loadMembers = useCallback(async (memberships: LedgerMembership[]) => {
    if (memberships.length === 0) {
      setMemberStateByLedgerId({});
      return;
    }

    const targetLedgerIds = new Set(memberships.map((membership) => membership.ledger.id));
    setMemberStateByLedgerId((current) => {
      const next: Record<string, LedgerMemberState> = {};
      memberships.forEach((membership) => {
        const ledgerId = membership.ledger.id;
        next[ledgerId] = {
          error: null,
          loading: true,
          members: current[ledgerId]?.members || []
        };
      });
      return next;
    });

    const results = await Promise.all(
      memberships.map(async (membership) => {
        const ledgerId = membership.ledger.id;
        try {
          return {
            error: null,
            ledgerId,
            members: await getLedgerMembers(ledgerId)
          };
        } catch (memberError) {
          return {
            error: getErrorMessage(memberError),
            ledgerId,
            members: [] as LedgerMemberProfile[]
          };
        }
      })
    );

    setMemberStateByLedgerId((current) => {
      const next: Record<string, LedgerMemberState> = {};
      results.forEach((result) => {
        if (!targetLedgerIds.has(result.ledgerId)) {
          return;
        }
        next[result.ledgerId] = {
          error: result.error,
          loading: false,
          members: result.error ? current[result.ledgerId]?.members || [] : result.members
        };
      });
      return next;
    });
  }, []);

  useEffect(() => {
    void loadMembers(ledgers);
  }, [ledgers, loadMembers]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      await reloadLedgers();
      await loadMembers(ledgers);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleCreate() {
    setSubmittingAction('create');
    setError(null);

    try {
      await createAndSelect(ledgerName);
      setLedgerName(DEFAULT_LEDGER_NAME);
    } catch (createError) {
      Alert.alert('Create Failed', getErrorMessage(createError));
    } finally {
      setSubmittingAction(null);
    }
  }

  async function handleJoin() {
    setSubmittingAction('join');
    setError(null);

    try {
      await joinAndSelect(inviteCode);
      setInviteCode('');
    } catch (joinError) {
      Alert.alert('Join Failed', getErrorMessage(joinError));
    } finally {
      setSubmittingAction(null);
    }
  }

  async function handleSelect(ledgerId: string) {
    const action: LedgerAction = `switch:${ledgerId}`;
    setSubmittingAction(action);
    setError(null);

    try {
      await selectLedger(ledgerId);
    } catch (selectError) {
      setError(getErrorMessage(selectError));
    } finally {
      setSubmittingAction(null);
    }
  }

  function confirmDelete(membership: LedgerMembership) {
    Alert.alert(
      'Delete Ledger',
      `After deleting "${membership.ledger.name}", the ledger, expense history, categories, and member-visible data will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const action: LedgerAction = `delete:${membership.ledger.id}`;
            setSubmittingAction(action);
            setError(null);
            try {
              await deleteLedger(membership.ledger.id);
            } catch (deleteError) {
              Alert.alert('Delete Failed', getErrorMessage(deleteError));
            } finally {
              setSubmittingAction(null);
            }
          }
        }
      ]
    );
  }

  function confirmLeave(membership: LedgerMembership) {
    Alert.alert('Leave Ledger', `After leaving "${membership.ledger.name}", you will no longer be able to view this ledger. Historical expenses and unsettled balances remain for other members.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          const action: LedgerAction = `leave:${membership.ledger.id}`;
          setSubmittingAction(action);
          setError(null);
          try {
            await leaveLedger(membership.ledger.id);
          } catch (leaveError) {
            Alert.alert('Leave Failed', getErrorMessage(leaveError));
          } finally {
            setSubmittingAction(null);
          }
        }
      }
    ]);
  }

  function renderLedgerCard(membership: LedgerMembership, isActive: boolean) {
    const ledgerId = membership.ledger.id;
    return (
      <LedgerCard
        currentUserId={session?.user.id || null}
        isActive={isActive}
        key={ledgerId}
        memberState={memberStateByLedgerId[ledgerId]}
        membership={membership}
        onDelete={() => confirmDelete(membership)}
        onLeave={() => confirmLeave(membership)}
        onSwitch={() => handleSelect(ledgerId)}
        submittingAction={submittingAction}
      />
    );
  }

  const pageError = ledgerError || error;

  return (
    <KeyboardAwareScrollView
      refreshControl={<RefreshControl refreshing={refreshing || loading} onRefresh={refresh} />}
      style={styles.page}
      contentContainerStyle={localStyles.content}
    >
      {pageError ? <Text selectable style={styles.error}>{pageError}</Text> : null}
      {memberErrorCount > 0 ? (
        <Text selectable style={styles.error}>
          Could not load members for {memberErrorCount} ledger{memberErrorCount === 1 ? '' : 's'}.
        </Text>
      ) : null}
      {loading ? <ActivityIndicator /> : null}

      <SectionHead title="Current Ledger" />
      {currentLedger ? (
        renderLedgerCard(currentLedger, true)
      ) : (
        <EmptyState
          icon="journal-outline"
          title="No current ledger"
          description="Create a new ledger or join one with an invite code to start tracking expenses."
        />
      )}

      <SectionHead title="Other Ledgers" />
      {otherLedgers.length > 0 ? (
        <View style={localStyles.ledgerList}>
          {otherLedgers.map((membership) => renderLedgerCard(membership, false))}
        </View>
      ) : (
        <EmptyState
          compact
          icon="albums-outline"
          title="No other ledgers"
          description={ledgers.length === 0 ? 'Your ledgers will appear here after you create or join one.' : 'Additional ledgers will appear here.'}
        />
      )}

      <FormCard
        actionIcon="add-circle-outline"
        actionLabel={submittingAction === 'create' ? 'Processing...' : 'Create and Select'}
        disabled={Boolean(submittingAction)}
        icon="create-outline"
        onSubmit={() => runAfterKeyboardDismiss(handleCreate)}
        subtitle="Start a new shared ledger and make it current."
        title="Create Ledger"
      >
        <Text style={styles.label}>Ledger Name</Text>
        <TextInput
          inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
          onChangeText={setLedgerName}
          returnKeyType="done"
          style={styles.input}
          submitBehavior="blurAndSubmit"
          value={ledgerName}
        />
      </FormCard>

      <FormCard
        actionIcon="enter-outline"
        actionLabel={submittingAction === 'join' ? 'Processing...' : 'Join and Select'}
        disabled={Boolean(submittingAction)}
        icon="key-outline"
        onSubmit={() => runAfterKeyboardDismiss(handleJoin)}
        secondary
        subtitle="Use an invite code from another member."
        title="Join Ledger"
      >
        <Text style={styles.label}>Invite Code</Text>
        <TextInput
          autoCapitalize="characters"
          inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
          onChangeText={setInviteCode}
          placeholder="Example: A1B2C3D4"
          returnKeyType="done"
          style={styles.input}
          submitBehavior="blurAndSubmit"
          value={inviteCode}
        />
      </FormCard>
    </KeyboardAwareScrollView>
  );
}

function LedgerCard({
  currentUserId,
  isActive,
  memberState,
  membership,
  onDelete,
  onLeave,
  onSwitch,
  submittingAction
}: {
  currentUserId: string | null;
  isActive: boolean;
  memberState?: LedgerMemberState;
  membership: LedgerMembership;
  onDelete: () => void;
  onLeave: () => void;
  onSwitch: () => void;
  submittingAction: LedgerAction | null;
}) {
  const ledgerColor = colorForId(membership.ledger.id);
  const destructiveAction: LedgerAction = membership.isOwner ? `delete:${membership.ledger.id}` : `leave:${membership.ledger.id}`;
  const switchAction: LedgerAction = `switch:${membership.ledger.id}`;
  const actionDisabled = Boolean(submittingAction);
  const destructiveLabel = membership.isOwner ? 'Delete Ledger' : 'Leave Ledger';

  return (
    <View style={[localStyles.card, localStyles.ledgerCard, isActive && localStyles.activeCard]}>
      <View style={localStyles.ledgerHeader}>
        <CircleIcon
          backgroundColor={isActive ? ledgerColor : tintFromAccent(ledgerColor)}
          color={isActive ? '#FFFFFF' : ledgerColor}
          icon={isActive ? 'journal' : 'journal-outline'}
          shadowColor={isActive ? ledgerColor : undefined}
          size={40}
        />
        <View style={localStyles.ledgerTitleBlock}>
          <Text numberOfLines={1} style={localStyles.ledgerName}>{membership.ledger.name}</Text>
        </View>
      </View>

      <MemberPreview
        currentUserId={currentUserId}
        ledgerOwnerId={membership.ledger.created_by}
        memberState={memberState}
      />

      <View style={localStyles.inviteCodeBox}>
        <Ionicons color={colors.primaryDark} name="key-outline" size={17} />
        <View style={localStyles.inviteTextBlock}>
          <Text style={localStyles.inviteLabel}>INVITE CODE</Text>
          <Text numberOfLines={1} selectable style={localStyles.inviteCode}>{membership.ledger.invite_code}</Text>
        </View>
      </View>

      <View style={localStyles.actionRow}>
        {!isActive ? (
          <LedgerActionButton
            compact
            disabled={actionDisabled}
            icon="swap-horizontal"
            label={submittingAction === switchAction ? 'Switching...' : 'Switch'}
            onPress={onSwitch}
          />
        ) : null}
        <LedgerActionButton
          compact
          danger
          disabled={actionDisabled}
          icon={membership.isOwner ? 'trash-outline' : 'log-out-outline'}
          label={submittingAction === destructiveAction ? 'Processing...' : destructiveLabel}
          onPress={membership.isOwner ? onDelete : onLeave}
          secondary={!isActive}
        />
      </View>
    </View>
  );
}

function MemberPreview({
  currentUserId,
  ledgerOwnerId,
  memberState
}: {
  currentUserId: string | null;
  ledgerOwnerId: string;
  memberState?: LedgerMemberState;
}) {
  if (!memberState || memberState.loading) {
    return (
      <View style={localStyles.memberLoadingRow}>
        <ActivityIndicator size="small" />
        <Text style={localStyles.memberMuted}>Loading members</Text>
      </View>
    );
  }

  if (memberState.error) {
    return (
      <View style={localStyles.pillRow}>
        <InfoPill color={colors.danger} icon="warning-outline" label="Members unavailable" />
      </View>
    );
  }

  if (memberState.members.length === 0) {
    return (
      <View style={localStyles.pillRow}>
        <InfoPill color={colors.muted} icon="people-outline" label="No members" />
      </View>
    );
  }

  return (
    <View style={localStyles.memberChips}>
      {memberState.members.slice(0, 3).map((member, index) => {
        const labels = [
          member.user_id === currentUserId ? 'Me' : displayName(member.profile.display_name),
          member.user_id === ledgerOwnerId ? 'Owner' : null
        ].filter(Boolean);

        return (
          <MemberChip
            color={LEDGER_COLORS[index % LEDGER_COLORS.length]}
            key={member.user_id}
            label={labels.join(' · ').toUpperCase()}
          />
        );
      })}
      {memberState.members.length > 3 ? <MemberChip color={colors.muted} label={`+${memberState.members.length - 3}`} /> : null}
    </View>
  );
}

function FormCard({
  actionIcon,
  actionLabel,
  children,
  disabled,
  icon,
  onSubmit,
  secondary,
  subtitle,
  title
}: {
  actionIcon: IoniconName;
  actionLabel: string;
  children: React.ReactNode;
  disabled: boolean;
  icon: IoniconName;
  onSubmit: () => void;
  secondary?: boolean;
  subtitle: string;
  title: string;
}) {
  const iconColor = secondary ? colors.accent : colors.primaryDark;
  return (
    <View style={localStyles.card}>
      <View style={localStyles.formHeader}>
        <CircleIcon
          backgroundColor={tintFromAccent(iconColor)}
          color={iconColor}
          icon={icon}
          size={42}
        />
        <View style={localStyles.ledgerTitleBlock}>
          <Text style={localStyles.formTitle}>{title}</Text>
          <Text style={localStyles.formSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <View style={localStyles.formBody}>
        {children}
        <LedgerActionButton
          disabled={disabled}
          icon={actionIcon}
          label={actionLabel}
          onPress={onSubmit}
          secondary={secondary}
        />
      </View>
    </View>
  );
}

function LedgerActionButton({
  danger,
  disabled,
  icon,
  label,
  onPress,
  secondary,
  compact
}: {
  compact?: boolean;
  danger?: boolean;
  disabled: boolean;
  icon: IoniconName;
  label: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        localStyles.actionButton,
        compact && localStyles.compactActionButton,
        secondary && localStyles.secondaryButton,
        danger && localStyles.dangerButton,
        danger && secondary && localStyles.secondaryDangerButton,
        disabled && localStyles.disabled,
        pressed && !disabled && localStyles.pressed
      ]}
    >
      <Ionicons color={buttonTextColor(danger, secondary)} name={icon} size={17} />
      <Text numberOfLines={1} style={[localStyles.actionButtonText, (secondary || danger) && { color: buttonTextColor(danger, secondary) }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyState({
  compact,
  description,
  icon,
  title
}: {
  compact?: boolean;
  description: string;
  icon: IoniconName;
  title: string;
}) {
  return (
    <View style={[localStyles.emptyState, compact && localStyles.emptyStateCompact]}>
      <CircleIcon backgroundColor="rgba(255,255,255,0.88)" color={colors.muted} icon={icon} size={42} />
      <View style={localStyles.ledgerTitleBlock}>
        <Text style={localStyles.emptyTitle}>{title}</Text>
        <Text style={localStyles.emptyDescription}>{description}</Text>
      </View>
    </View>
  );
}

function SectionHead({ title }: { title: string }) {
  return (
    <View style={localStyles.sectionHead}>
      <Text style={localStyles.sectionTitle}>{title}</Text>
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

function MemberChip({ color, label }: { color: string; label: string }) {
  return (
    <View style={[localStyles.memberChip, { backgroundColor: tintFromAccent(color) }]}>
      <View style={[localStyles.memberDot, { backgroundColor: color }]} />
      <Text numberOfLines={1} style={[localStyles.memberChipText, { color }]}>{label}</Text>
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

function buttonTextColor(danger?: boolean, secondary?: boolean) {
  if (danger) {
    return secondary ? colors.danger : '#FFFFFF';
  }
  return secondary ? colors.primaryDark : '#FFFFFF';
}

const localStyles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: theme.radii.control,
    flexDirection: 'row',
    flex: 1,
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  activeCard: {
    backgroundColor: colors.tint,
    borderColor: 'rgba(15,118,110,0.18)'
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 15,
    overflow: 'hidden',
    padding: 16,
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
    gap: 14,
    maxWidth: 720,
    padding: 20,
    paddingBottom: 128,
    width: '100%'
  },
  compactActionButton: {
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  dangerButton: {
    backgroundColor: colors.danger
  },
  disabled: {
    opacity: 0.46
  },
  emptyDescription: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 16
  },
  emptyStateCompact: {
    paddingVertical: 14
  },
  emptyTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  formBody: {
    gap: 12
  },
  formHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12
  },
  formSubtitle: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18
  },
  formTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21
  },
  infoPill: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 5,
    maxWidth: '100%',
    minHeight: 22,
    paddingHorizontal: 7,
    paddingVertical: 3
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
    maxWidth: 170
  },
  inviteCode: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    lineHeight: 18
  },
  inviteCodeBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 42,
    paddingHorizontal: 11,
    paddingVertical: 7
  },
  inviteLabel: {
    color: colors.muted,
    fontFamily: fontFamilies.extraBold,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    lineHeight: 12
  },
  inviteTextBlock: {
    flex: 1,
    minWidth: 0
  },
  ledgerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10
  },
  ledgerCard: {
    gap: 10,
    padding: 12
  },
  ledgerList: {
    gap: 12
  },
  ledgerName: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30
  },
  ledgerTitleBlock: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  memberChip: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  memberChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  memberChipText: {
    fontFamily: fontFamilies.bold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 14,
    maxWidth: 180
  },
  memberDot: {
    borderRadius: 4,
    height: 8,
    width: 8
  },
  memberLoadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 24
  },
  memberMuted: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  pressed: {
    opacity: 0.76
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: colors.line,
    borderWidth: 1
  },
  secondaryDangerButton: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(220,38,38,0.24)',
    borderWidth: 1
  },
  sectionHead: {
    paddingTop: 3
  },
  sectionTitle: {
    color: colors.muted,
    fontFamily: fontFamilies.extraBold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
    lineHeight: 15,
    textTransform: 'uppercase'
  },
  subtitle: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20
  }
});
