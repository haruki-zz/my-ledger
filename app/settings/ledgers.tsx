import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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
import { tintFromAccent } from '@/src/lib/color';
import { displayName } from '@/src/lib/format';
import { runAfterKeyboardDismiss } from '@/src/lib/keyboard';
import { getErrorMessage, getLedgerMembers, type LedgerMembership } from '@/src/lib/ledger';
import type { LedgerMemberProfile } from '@/src/types/database';

type IoniconName = keyof typeof Ionicons.glyphMap;

type LedgerMemberState = {
  error: string | null;
  loading: boolean;
  members: LedgerMemberProfile[];
};

type LedgerAction = 'create' | 'join' | `switch:${string}`;

const DEFAULT_LEDGER_NAME = 'Ledger';
const LEDGER_COLORS = ['#CB5F43', '#8AA248', '#4F77BE', '#8A6FB6', '#D2A032', '#4E97B5'];

export default function LedgerManagementScreen() {
  const { session } = useAuth();
  const {
    activeLedger,
    createAndSelect,
    error: ledgerError,
    joinAndSelect,
    ledgers,
    loading,
    reloadLedgers,
    selectLedger
  } = useLedgerContext();
  const [ledgerName, setLedgerName] = useState(DEFAULT_LEDGER_NAME);
  const [inviteCode, setInviteCode] = useState('');
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [joinPanelOpen, setJoinPanelOpen] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<LedgerAction | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberStateByLedgerId, setMemberStateByLedgerId] = useState<Record<string, LedgerMemberState>>({});

  const activeLedgerId = activeLedger?.ledger.id || null;
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
      const membership = await createAndSelect(ledgerName);
      setLedgerName(DEFAULT_LEDGER_NAME);
      setCreatePanelOpen(false);
      if (membership) {
        router.push({ pathname: '/settings/ledger/[ledgerId]', params: { ledgerId: membership.ledger.id } });
      }
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
      const membership = await joinAndSelect(inviteCode);
      setInviteCode('');
      setJoinPanelOpen(false);
      if (membership) {
        router.push({ pathname: '/settings/ledger/[ledgerId]', params: { ledgerId: membership.ledger.id } });
      }
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

      <SectionHead title="Ledgers" />
      <View style={localStyles.card}>
        {ledgers.length > 0 ? ledgers.map((membership, index) => (
          <LedgerListRow
            currentUserId={session?.user.id || null}
            isActive={membership.ledger.id === activeLedgerId}
            key={membership.ledger.id}
            memberState={memberStateByLedgerId[membership.ledger.id]}
            membership={membership}
            onOpen={() => router.push({ pathname: '/settings/ledger/[ledgerId]', params: { ledgerId: membership.ledger.id } })}
            onSwitch={() => {
              void handleSelect(membership.ledger.id);
            }}
            showDivider={index > 0}
            submitting={submittingAction === `switch:${membership.ledger.id}`}
          />
        )) : (
          <EmptyState
            icon="journal-outline"
            title="No ledgers"
            description="Create a new ledger or join one with an invite code to start tracking expenses."
          />
        )}
      </View>

      <View style={localStyles.card}>
        <View style={localStyles.actionChooser}>
          <Pressable
            disabled={Boolean(submittingAction)}
            onPress={() => {
              setCreatePanelOpen((current) => !current);
              setJoinPanelOpen(false);
            }}
            style={({ pressed }) => [localStyles.primaryAction, submittingAction && localStyles.disabled, pressed && !submittingAction && localStyles.pressed]}
          >
            <Ionicons color="#FFFFFF" name="add" size={16} />
            <Text style={localStyles.primaryActionText}>Create ledger</Text>
          </Pressable>
          <Pressable
            disabled={Boolean(submittingAction)}
            onPress={() => {
              setJoinPanelOpen((current) => !current);
              setCreatePanelOpen(false);
            }}
            style={({ pressed }) => [localStyles.secondaryAction, submittingAction && localStyles.disabled, pressed && !submittingAction && localStyles.pressed]}
          >
            <Text style={localStyles.secondaryActionText}>Join with code</Text>
          </Pressable>
        </View>

        {createPanelOpen ? (
          <InlinePanel>
            <Text style={localStyles.fieldLabel}>Ledger name</Text>
            <TextInput
              inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
              onChangeText={setLedgerName}
              returnKeyType="done"
              style={localStyles.input}
              submitBehavior="blurAndSubmit"
              value={ledgerName}
            />
            <SubmitButton
              disabled={Boolean(submittingAction)}
              icon="checkmark"
              label={submittingAction === 'create' ? 'Creating...' : 'Create and set active'}
              onPress={() => runAfterKeyboardDismiss(handleCreate)}
            />
          </InlinePanel>
        ) : null}

        {joinPanelOpen ? (
          <InlinePanel>
            <Text style={localStyles.fieldLabel}>Invite code</Text>
            <TextInput
              autoCapitalize="characters"
              inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
              onChangeText={setInviteCode}
              placeholder="Example: A1B2C3D4"
              placeholderTextColor={colors.subtle}
              returnKeyType="done"
              style={[localStyles.input, localStyles.monoInput]}
              submitBehavior="blurAndSubmit"
              value={inviteCode}
            />
            <SubmitButton
              disabled={Boolean(submittingAction) || inviteCode.trim().length === 0}
              icon="enter-outline"
              label={submittingAction === 'join' ? 'Joining...' : 'Join and set active'}
              onPress={() => runAfterKeyboardDismiss(handleJoin)}
            />
          </InlinePanel>
        ) : null}
      </View>
    </KeyboardAwareScrollView>
  );
}

function LedgerListRow({
  currentUserId,
  isActive,
  memberState,
  membership,
  onOpen,
  onSwitch,
  showDivider,
  submitting
}: {
  currentUserId: string | null;
  isActive: boolean;
  memberState?: LedgerMemberState;
  membership: LedgerMembership;
  onOpen: () => void;
  onSwitch: () => void;
  showDivider: boolean;
  submitting: boolean;
}) {
  const ledgerColor = colorForId(membership.ledger.id);
  const memberCount = memberState?.members.length ?? 0;

  return (
    <View>
      {showDivider ? <View style={localStyles.insetDivider} /> : null}
      <View style={localStyles.ledgerRow}>
        <Pressable onPress={onOpen} style={({ pressed }) => [localStyles.ledgerMain, pressed && localStyles.pressed]}>
          <CircleIcon
            backgroundColor={isActive ? ledgerColor : tintFromAccent(ledgerColor)}
            color={isActive ? '#FFFFFF' : ledgerColor}
            icon={isActive ? 'journal' : 'journal-outline'}
            shadowColor={isActive ? ledgerColor : undefined}
            size={40}
          />
          <View style={localStyles.ledgerTitleBlock}>
            <View style={localStyles.ledgerTitleLine}>
              <Text numberOfLines={1} style={localStyles.ledgerName}>{membership.ledger.name}</Text>
              {isActive ? <ActiveBadge /> : null}
            </View>
            <Text numberOfLines={1} style={localStyles.ledgerMeta}>
              {membership.isOwner ? 'Owner' : 'Member'} · {memberState?.loading ? 'loading members' : `${memberCount} member${memberCount === 1 ? '' : 's'}`}
            </Text>
            <MemberPreview
              currentUserId={currentUserId}
              ledgerOwnerId={membership.ledger.owner_id || membership.ledger.created_by}
              memberState={memberState}
            />
          </View>
        </Pressable>

        {isActive ? null : (
          <Pressable
            disabled={submitting}
            onPress={onSwitch}
            style={({ pressed }) => [localStyles.switchPill, submitting && localStyles.disabled, pressed && !submitting && localStyles.pressed]}
          >
            {submitting ? <ActivityIndicator size="small" /> : <Text style={localStyles.switchPillText}>Switch</Text>}
          </Pressable>
        )}
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
    return null;
  }

  if (memberState.error) {
    return (
      <View style={localStyles.memberChips}>
        <InfoPill color={colors.danger} icon="warning-outline" label="Members unavailable" />
      </View>
    );
  }

  if (memberState.members.length === 0) {
    return (
      <View style={localStyles.memberChips}>
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

function InlinePanel({ children }: { children: React.ReactNode }) {
  return (
    <View style={localStyles.inlinePanel}>
      {children}
    </View>
  );
}

function SubmitButton({
  disabled,
  icon,
  label,
  onPress
}: {
  disabled: boolean;
  icon: IoniconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [localStyles.submitButton, disabled && localStyles.disabled, pressed && !disabled && localStyles.pressed]}
    >
      <Ionicons color="#FFFFFF" name={icon} size={17} />
      <Text style={localStyles.submitButtonText}>{label}</Text>
    </Pressable>
  );
}

function EmptyState({
  description,
  icon,
  title
}: {
  description: string;
  icon: IoniconName;
  title: string;
}) {
  return (
    <View style={localStyles.emptyState}>
      <CircleIcon backgroundColor="rgba(42,39,34,0.05)" color={colors.muted} icon={icon} size={42} />
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

function ActiveBadge() {
  return (
    <View style={localStyles.activeBadge}>
      <Text style={localStyles.activeBadgeText}>Active</Text>
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

const localStyles = StyleSheet.create({
  actionChooser: {
    flexDirection: 'row',
    gap: 10,
    padding: 14
  },
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
  disabled: {
    opacity: 0.45
  },
  emptyDescription: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18
  },
  emptyState: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 92,
    padding: 16
  },
  emptyTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21
  },
  fieldLabel: {
    color: colors.muted,
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    lineHeight: 14,
    textTransform: 'uppercase'
  },
  infoPill: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 5,
    maxWidth: 150,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  infoPillDot: {
    borderRadius: 2.5,
    height: 5,
    width: 5
  },
  infoPillText: {
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 9.5,
    fontWeight: '800',
    lineHeight: 13
  },
  inlinePanel: {
    borderTopColor: 'rgba(42,39,34,0.08)',
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
    padding: 14,
    paddingTop: 12
  },
  input: {
    backgroundColor: 'rgba(42,39,34,0.04)',
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  insetDivider: {
    backgroundColor: 'rgba(42,39,34,0.08)',
    height: StyleSheet.hairlineWidth,
    marginLeft: 68
  },
  ledgerMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    minWidth: 0
  },
  ledgerMeta: {
    color: colors.subtle,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16
  },
  ledgerName: {
    color: colors.ink,
    flexShrink: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21
  },
  ledgerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 74,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  ledgerTitleBlock: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  ledgerTitleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minWidth: 0
  },
  memberChip: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 5,
    maxWidth: 132,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  memberChipText: {
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 9.5,
    fontWeight: '800',
    lineHeight: 13
  },
  memberChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  memberDot: {
    borderRadius: 2.5,
    height: 5,
    width: 5
  },
  monoInput: {
    fontFamily: fontFamilies.monoBold,
    fontWeight: '700',
    letterSpacing: 0.8
  },
  pressed: {
    opacity: 0.7
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: theme.radii.pill,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 12
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.extraBold,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(42,39,34,0.04)',
    borderColor: 'rgba(42,39,34,0.14)',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 12
  },
  secondaryActionText: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18
  },
  sectionHead: {
    paddingHorizontal: 4,
    paddingTop: 2
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
  submitButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 46
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.extraBold,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18
  },
  switchPill: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: 'rgba(42,39,34,0.14)',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 68,
    paddingHorizontal: 11
  },
  switchPillText: {
    color: colors.muted,
    fontFamily: fontFamilies.extraBold,
    fontSize: 10.5,
    fontWeight: '800',
    lineHeight: 14
  }
});
