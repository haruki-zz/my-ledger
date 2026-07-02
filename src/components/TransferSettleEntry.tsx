import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native';
import Reanimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { motionCardResizeTransition, motionPanelIn, motionPanelOut } from '@/src/components/motion';
import { completedAtForUser, isParticipant } from '@/src/components/TransferChecklistShared';
import { colors, fontFamilies, theme } from '@/src/components/styles';
import { tintFromAccent } from '@/src/lib/color';
import { categoryWithSubcategory } from '@/src/lib/categorySystem';
import { buildUserColorMap, DEFAULT_USER_COLOR } from '@/src/lib/entityColors';
import { displayName, formatYen } from '@/src/lib/format';
import type { TransferConfirmationUpdate } from '@/src/lib/ledger';
import { useReduceMotion } from '@/src/lib/motion';
import { buildNetSummary, shouldHideSettledTransferEntry, type NetSummary } from '@/src/lib/transferSummary';
import type { LedgerMemberProfile, TransferChecklistItemRow } from '@/src/types/database';

type TransferSettleEntryProps = {
  currentUserId: string | null;
  error: string | null;
  items: TransferChecklistItemRow[];
  loading: boolean;
  members: LedgerMemberProfile[];
  onSetConfirmations: (updates: TransferConfirmationUpdate[]) => Promise<void>;
  saving: boolean;
};

type ConfirmationOverrides = Record<string, boolean>;

type BlurFallbackBoundaryProps = {
  children: ReactNode;
};

type BlurFallbackBoundaryState = {
  failed: boolean;
};

const UP_COLOR = '#E8957B';
const PAPER_COLOR = '#FFFDF7';
const MINA_COLOR = '#3F8A86';
const MINA_ON_DARK = '#5FB8B2';
const ENTER_DURATION_MS = 420;
const EXIT_DURATION_MS = 240;
const DISMISS_DRAG_DISTANCE = 70;
const DISMISS_DRAG_VELOCITY = 0.85;

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric'
});

export function TransferSettleEntry({
  currentUserId,
  error,
  items,
  loading,
  members,
  onSetConfirmations,
  saving
}: TransferSettleEntryProps) {
  const reduceMotion = useReduceMotion();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetRendered, setSheetRendered] = useState(false);
  const [confirmationOverrides, setConfirmationOverrides] = useState<ConfirmationOverrides>({});
  const resize = motionCardResizeTransition(reduceMotion);
  const panelIn = motionPanelIn(reduceMotion);
  const panelOut = motionPanelOut(reduceMotion);
  const userIds = useMemo(() => members.map((member) => member.user_id), [members]);
  const nameByUserId = useMemo(() => (
    new Map(members.map((member) => [member.user_id, displayName(member.profile.display_name)]))
  ), [members]);
  const userColorById = useMemo(() => (
    buildUserColorMap(userIds, currentUserId)
  ), [currentUserId, userIds]);

  const participantItems = useMemo(() => (
    currentUserId ? items.filter((item) => isParticipant(item, currentUserId)) : []
  ), [currentUserId, items]);
  const openParticipantItems = useMemo(() => (
    participantItems.filter((item) => !isConfirmedForCurrentUser(item, currentUserId, confirmationOverrides))
  ), [confirmationOverrides, currentUserId, participantItems]);
  const remainingSummary = useMemo(() => (
    buildNetSummary(openParticipantItems, members)
  ), [members, openParticipantItems]);
  const allParticipantItemsConfirmed = participantItems.length > 0 && openParticipantItems.length === 0;
  const openCount = openParticipantItems.length;
  const canOpenSheet = items.length > 0 || openCount > 0 || allParticipantItemsConfirmed;
  const directionText = transferDirectionText(remainingSummary, userName);
  const sheetActive = sheetVisible || sheetRendered;
  const shouldHideEntry = shouldHideSettledTransferEntry({
    error,
    loading,
    openCount,
    saving,
    sheetActive
  });

  useEffect(() => {
    if (!error) {
      return;
    }

    setConfirmationOverrides({});
  }, [error]);

  useEffect(() => {
    setConfirmationOverrides((current) => {
      const next: ConfirmationOverrides = {};
      let changed = false;
      const itemById = new Map(items.map((item) => [item.expense_id, item]));

      for (const [expenseId, confirmed] of Object.entries(current)) {
        const item = itemById.get(expenseId);
        if (!item || Boolean(completedAtForUser(item, currentUserId)) === confirmed) {
          changed = true;
          continue;
        }

        next[expenseId] = confirmed;
      }

      return changed ? next : current;
    });
  }, [currentUserId, items]);

  function userName(userId: string | null) {
    if (!userId) {
      return 'Both users';
    }

    return nameByUserId.get(userId) || 'Unnamed user';
  }

  function userColor(userId: string | null) {
    return userId ? userColorById.get(userId) || DEFAULT_USER_COLOR : DEFAULT_USER_COLOR;
  }

  function openSheet() {
    setSheetRendered(true);
    setSheetVisible(true);
  }

  function closeSheet() {
    setSheetVisible(false);
  }

  async function applyConfirmationUpdates(updates: TransferConfirmationUpdate[]) {
    if (updates.length === 0 || saving) {
      return;
    }

    setConfirmationOverrides((current) => {
      const next = { ...current };
      for (const update of updates) {
        next[update.expense_id] = update.confirmed;
      }
      return next;
    });

    try {
      await onSetConfirmations(updates);
    } catch {
      setConfirmationOverrides({});
    }
  }

  function toggleItem(item: TransferChecklistItemRow) {
    if (!currentUserId || !isParticipant(item, currentUserId)) {
      return;
    }

    void applyConfirmationUpdates([{
      expense_id: item.expense_id,
      confirmed: !isConfirmedForCurrentUser(item, currentUserId, confirmationOverrides)
    }]);
  }

  function toggleAllParticipantItems() {
    if (!currentUserId || participantItems.length === 0) {
      return;
    }

    const nextConfirmed = openParticipantItems.length > 0;
    void applyConfirmationUpdates(
      participantItems.map((item) => ({
        expense_id: item.expense_id,
        confirmed: nextConfirmed
      }))
    );
  }

  if (shouldHideEntry) {
    return null;
  }

  return (
    <>
      <Reanimated.View
        entering={panelIn}
        exiting={panelOut}
        layout={resize}
      >
        <View style={settleStyles.heroDivider} />
        <Pressable
          accessibilityLabel={openCount > 0 ? `${directionText}, ${openCount} open transfer items` : 'All transfers settled'}
          accessibilityRole="button"
          disabled={loading || !canOpenSheet}
          onPress={openSheet}
          style={({ pressed }) => [
            openCount > 0 ? settleStyles.openStrip : settleStyles.doneStrip,
            pressed && !loading && canOpenSheet && settleStyles.stripPressed,
            (loading || !canOpenSheet) && settleStyles.stripDisabled
          ]}
        >
          {loading ? (
            <>
              <View style={settleStyles.openIconChip}>
                <ActivityIndicator color={UP_COLOR} size="small" />
              </View>
              <View style={settleStyles.stripBody}>
                <Text style={settleStyles.openLineOne}>Loading transfers</Text>
                <Text style={settleStyles.openLineTwo}>TAP TO REVIEW</Text>
              </View>
            </>
          ) : openCount > 0 ? (
            <>
              <View style={settleStyles.openIconChip}>
                <Ionicons color={UP_COLOR} name="swap-horizontal" size={16} />
              </View>
              <View style={settleStyles.stripBody}>
                <Text ellipsizeMode="tail" numberOfLines={1} style={settleStyles.openLineOne}>
                  {directionText} <Text style={settleStyles.openAmount}>{formatYen(remainingSummary.amountYen)}</Text>
                </Text>
                <Text style={settleStyles.openLineTwo}>
                  {openCount} OPEN {openCount === 1 ? 'ITEM' : 'ITEMS'}
                </Text>
              </View>
              <View style={settleStyles.settleButton}>
                <Text style={settleStyles.settleButtonText}>Settle</Text>
                <Ionicons color={colors.primary} name="chevron-forward" size={13} />
              </View>
            </>
          ) : (
            <>
              <View style={settleStyles.doneIconChip}>
                <Ionicons color={MINA_ON_DARK} name="checkmark" size={12} />
              </View>
              <Text ellipsizeMode="tail" numberOfLines={1} style={settleStyles.doneText}>
                {"All settled - you're even"}
              </Text>
              <Text style={settleStyles.viewText}>VIEW</Text>
            </>
          )}
        </Pressable>
        {error ? <Text style={settleStyles.heroError}>{error}</Text> : null}
      </Reanimated.View>

      <TransferSettleSheet
        allParticipantItemsConfirmed={allParticipantItemsConfirmed}
        confirmationOverrides={confirmationOverrides}
        currentUserId={currentUserId}
        items={items}
        onClose={closeSheet}
        onClosed={() => setSheetRendered(false)}
        onToggleAll={toggleAllParticipantItems}
        onToggleItem={toggleItem}
        openCount={openCount}
        saving={saving}
        userColor={userColor}
        userName={userName}
        visible={sheetVisible}
      />
    </>
  );
}

function TransferSettleSheet({
  allParticipantItemsConfirmed,
  confirmationOverrides,
  currentUserId,
  items,
  onClose,
  onClosed,
  onToggleAll,
  onToggleItem,
  openCount,
  saving,
  userColor,
  userName,
  visible
}: {
  allParticipantItemsConfirmed: boolean;
  confirmationOverrides: ConfirmationOverrides;
  currentUserId: string | null;
  items: TransferChecklistItemRow[];
  onClose: () => void;
  onClosed: () => void;
  onToggleAll: () => void;
  onToggleItem: (item: TransferChecklistItemRow) => void;
  openCount: number;
  saving: boolean;
  userColor: (userId: string | null) => string;
  userName: (userId: string | null) => string;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { height, width } = useWindowDimensions();
  const [rendered, setRendered] = useState(visible);
  const [closing, setClosing] = useState(false);
  const [transitionProgress] = useState(() => new Animated.Value(0));
  const [dragY] = useState(() => new Animated.Value(0));
  const webDragCleanupRef = useRef<null | (() => void)>(null);
  const panelMaxHeight = Math.max(320, Math.min(height * 0.86, height - insets.top - 10));
  const participantCount = currentUserId
    ? items.filter((item) => isParticipant(item, currentUserId)).length
    : 0;
  const actionDisabled = saving || participantCount === 0;
  const dragBackdropOpacity = useMemo(() => (
    dragY.interpolate({
      extrapolate: 'clamp',
      inputRange: [0, panelMaxHeight],
      outputRange: [1, 0]
    })
  ), [dragY, panelMaxHeight]);
  const backdropOpacity = useMemo(() => (
    Animated.multiply(transitionProgress, dragBackdropOpacity)
  ), [dragBackdropOpacity, transitionProgress]);
  const springDragBack = useMemo(() => () => {
    Animated.spring(dragY, {
      damping: 18,
      mass: 0.7,
      stiffness: 180,
      toValue: 0,
      useNativeDriver: Platform.OS !== 'web'
    }).start();
  }, [dragY]);
  const handlePanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gestureState) => (
      gestureState.dy > 4 &&
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
    ),
    onMoveShouldSetPanResponder: (_, gestureState) => (
      gestureState.dy > 4 &&
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
    ),
    onPanResponderGrant: () => {
      dragY.stopAnimation();
      dragY.setValue(0);
    },
    onPanResponderMove: (_, gestureState) => {
      dragY.setValue(Math.max(0, gestureState.dy));
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > DISMISS_DRAG_DISTANCE || (gestureState.dy > 24 && gestureState.vy > DISMISS_DRAG_VELOCITY)) {
        onClose();
        return;
      }

      springDragBack();
    },
    onPanResponderTerminate: () => {
      springDragBack();
    },
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true
  }), [dragY, onClose, springDragBack]);
  const webHandleDragHandlers = useMemo(() => {
    if (Platform.OS !== 'web') {
      return {};
    }

    return {
      onMouseDown: (event: { nativeEvent?: { pageY?: number; preventDefault?: () => void } }) => {
        event.nativeEvent?.preventDefault?.();
        webDragCleanupRef.current?.();

        const startY = event.nativeEvent?.pageY ?? 0;
        let latestY = startY;
        const handleMove = (moveEvent: MouseEvent) => {
          latestY = moveEvent.pageY;
          dragY.setValue(Math.max(0, latestY - startY));
        };
        const handleEnd = () => {
          webDragCleanupRef.current?.();
          const dy = latestY - startY;
          if (dy > DISMISS_DRAG_DISTANCE) {
            onClose();
            return;
          }

          springDragBack();
        };
        const cleanup = () => {
          document.removeEventListener('mousemove', handleMove);
          document.removeEventListener('mouseup', handleEnd);
          webDragCleanupRef.current = null;
        };

        webDragCleanupRef.current = cleanup;
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
      }
    };
  }, [dragY, onClose, springDragBack]);

  useEffect(() => () => {
    webDragCleanupRef.current?.();
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setRendered(true);
    setClosing(false);
    dragY.setValue(0);
    transitionProgress.setValue(0);
    Animated.timing(transitionProgress, {
      duration: reduceMotion ? 0 : ENTER_DURATION_MS,
      toValue: 1,
      useNativeDriver: Platform.OS !== 'web'
    }).start();
  }, [dragY, reduceMotion, transitionProgress, visible]);

  useEffect(() => {
    if (visible || !rendered || closing) {
      return;
    }

    setClosing(true);
    transitionProgress.stopAnimation();
    Animated.timing(transitionProgress, {
      duration: reduceMotion ? 0 : EXIT_DURATION_MS,
      toValue: 0,
      useNativeDriver: Platform.OS !== 'web'
    }).start(({ finished }) => {
      if (!finished) {
        setClosing(false);
        return;
      }

      setRendered(false);
      setClosing(false);
      onClosed();
    });
  }, [closing, dragY, onClosed, reduceMotion, rendered, transitionProgress, visible]);

  if (!rendered) {
    return null;
  }

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible>
      <View style={sheetStyles.backdrop}>
        {Platform.OS === 'ios' ? (
          <BlurFallbackBoundary>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
              <BlurView intensity={24} style={StyleSheet.absoluteFill} tint="light" />
            </Animated.View>
          </BlurFallbackBoundary>
        ) : null}
        <Animated.View
          pointerEvents="none"
          style={[
            sheetStyles.scrim,
            Platform.OS === 'ios' && sheetStyles.scrimIos,
            { opacity: backdropOpacity }
          ]}
        />
        <Pressable
          accessibilityLabel="Close settle up"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />

        <View
          accessibilityLabel="Settle up"
          accessibilityViewIsModal
          style={[sheetStyles.sheetHitArea, { maxHeight: panelMaxHeight, width }]}
        >
          <Animated.View
            style={[
              sheetStyles.sheet,
              {
                maxHeight: panelMaxHeight,
                transform: [
                  {
                    translateY: Animated.add(
                      transitionProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [height, 0]
                      }),
                      dragY
                    )
                  }
                ]
              }
            ]}
          >
            <View
              accessible
              accessibilityLabel="Drag down to close settle up"
              style={sheetStyles.grabberWrap}
              {...handlePanResponder.panHandlers}
              {...webHandleDragHandlers}
            >
              <View style={sheetStyles.grabber} />
            </View>

            <View style={sheetStyles.header}>
              <View style={sheetStyles.headerText}>
                <Text style={sheetStyles.title}>Settle up</Text>
                <Text style={sheetStyles.meta}>
                  {openCount > 0 ? `${openCount} OPEN ${openCount === 1 ? 'ITEM' : 'ITEMS'}` : 'ALL SETTLED'}
                </Text>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={sheetStyles.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={sheetStyles.scroll}
            >
              {items.length > 0 ? (
                items.map((item) => {
                  const currentCompleted = isConfirmedForCurrentUser(item, currentUserId, confirmationOverrides);
                  const canToggle = Boolean(currentUserId && isParticipant(item, currentUserId));

                  return (
                    <TransferSettleRow
                      canToggle={canToggle}
                      checked={currentCompleted}
                      item={item}
                      key={item.expense_id}
                      onToggle={() => onToggleItem(item)}
                      saving={saving}
                      userColor={userColor}
                      userName={userName}
                    />
                  );
                })
              ) : (
                <View style={sheetStyles.emptyState}>
                  <Text style={sheetStyles.emptyTitle}>No transfer items</Text>
                  <Text style={sheetStyles.emptyText}>Shared expenses are even.</Text>
                </View>
              )}
            </ScrollView>

            <View style={[sheetStyles.footer, { paddingBottom: 12 + insets.bottom }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: actionDisabled }}
                disabled={actionDisabled}
                onPress={onToggleAll}
                style={({ pressed }) => [
                  sheetStyles.actionButton,
                  allParticipantItemsConfirmed && sheetStyles.actionButtonDone,
                  pressed && !actionDisabled && sheetStyles.actionButtonPressed,
                  actionDisabled && sheetStyles.actionButtonDisabled
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={allParticipantItemsConfirmed ? MINA_COLOR : PAPER_COLOR} size="small" />
                ) : (
                  <Ionicons
                    color={allParticipantItemsConfirmed ? MINA_COLOR : PAPER_COLOR}
                    name="checkmark"
                    size={18}
                  />
                )}
                <Text style={[
                  sheetStyles.actionButtonText,
                  allParticipantItemsConfirmed && sheetStyles.actionButtonTextDone
                ]}>
                  {allParticipantItemsConfirmed ? 'All settled' : 'Mark all settled'}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

function TransferSettleRow({
  canToggle,
  checked,
  item,
  onToggle,
  saving,
  userColor,
  userName
}: {
  canToggle: boolean;
  checked: boolean;
  item: TransferChecklistItemRow;
  onToggle: () => void;
  saving: boolean;
  userColor: (userId: string | null) => string;
  userName: (userId: string | null) => string;
}) {
  return (
    <Pressable
      accessibilityLabel={`${userName(item.payer_user_id)} to ${userName(item.payee_user_id)}, ${formatYen(item.amount_yen)}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !canToggle || saving }}
      disabled={!canToggle || saving}
      onPress={onToggle}
      style={({ pressed }) => [
        sheetStyles.row,
        checked && sheetStyles.rowChecked,
        !canToggle && sheetStyles.rowReadonly,
        pressed && canToggle && !saving && sheetStyles.rowPressed
      ]}
    >
      <View style={[
        sheetStyles.checkbox,
        checked && sheetStyles.checkboxChecked,
        (!canToggle || saving) && sheetStyles.checkboxDisabled
      ]}>
        {checked ? <Ionicons color="#FFFFFF" name="checkmark" size={17} /> : null}
      </View>

      <View style={sheetStyles.rowText}>
        <View style={sheetStyles.pillRow}>
          <UserPill color={userColor(item.payer_user_id)} label={userName(item.payer_user_id)} />
          <Text style={sheetStyles.toText}>to</Text>
          <UserPill color={userColor(item.payee_user_id)} label={userName(item.payee_user_id)} />
        </View>
        <Text
          ellipsizeMode="tail"
          numberOfLines={1}
          style={[sheetStyles.rowMeta, checked && sheetStyles.rowMetaChecked]}
        >
          {categoryWithSubcategory(item)} / {formatTransferDate(item.spent_on)}
        </Text>
      </View>

      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[sheetStyles.rowAmount, checked && sheetStyles.rowAmountChecked]}
      >
        {formatYen(item.amount_yen)}
      </Text>
    </Pressable>
  );
}

function UserPill({ color, label }: { color: string; label: string }) {
  return (
    <View style={[sheetStyles.userPill, { backgroundColor: tintFromAccent(color, 0.12) }]}>
      <Text ellipsizeMode="tail" numberOfLines={1} style={[sheetStyles.userPillText, { color }]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

function isConfirmedForCurrentUser(
  item: TransferChecklistItemRow,
  currentUserId: string | null,
  confirmationOverrides: ConfirmationOverrides
) {
  const override = confirmationOverrides[item.expense_id];
  if (override !== undefined) {
    return override;
  }

  return Boolean(completedAtForUser(item, currentUserId));
}

function transferDirectionText(
  netSummary: NetSummary,
  userName: (userId: string | null) => string
) {
  if (netSummary.amountYen <= 0 || !netSummary.payerUserId || !netSummary.payeeUserId) {
    return 'Transfers need review';
  }

  return `${userName(netSummary.payerUserId)} to ${userName(netSummary.payeeUserId)}`;
}

function formatTransferDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return dateFormatter.format(new Date(year, month - 1, day));
}

class BlurFallbackBoundary extends Component<BlurFallbackBoundaryProps, BlurFallbackBoundaryState> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return null;
    }

    return this.props.children;
  }
}

const settleStyles = StyleSheet.create({
  doneIconChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(95,184,178,0.22)',
    borderRadius: 6,
    height: 18,
    justifyContent: 'center',
    width: 18
  },
  doneStrip: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    marginTop: 11,
    minHeight: 44
  },
  doneText: {
    color: 'rgba(255,253,247,0.62)',
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 17,
    minWidth: 0
  },
  heroDivider: {
    backgroundColor: 'rgba(255,253,247,0.12)',
    height: 1,
    marginTop: 12
  },
  heroError: {
    color: UP_COLOR,
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 6
  },
  openAmount: {
    color: UP_COLOR,
    fontFamily: fontFamilies.monoExtraBold,
    fontWeight: '800'
  },
  openIconChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(232,149,123,0.16)',
    borderRadius: 9,
    flexShrink: 0,
    height: 30,
    justifyContent: 'center',
    width: 30
  },
  openLineOne: {
    color: PAPER_COLOR,
    fontFamily: fontFamilies.bold,
    fontSize: 13.5,
    fontWeight: '700',
    lineHeight: 17
  },
  openLineTwo: {
    color: 'rgba(255,253,247,0.50)',
    fontFamily: fontFamilies.mono,
    fontSize: 9.5,
    letterSpacing: 0.4,
    lineHeight: 13,
    marginTop: 2
  },
  openStrip: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    marginTop: 11,
    minHeight: 44
  },
  settleButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,253,247,0.92)',
    borderRadius: 9,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 3,
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  settleButtonText: {
    color: colors.primary,
    fontFamily: fontFamilies.extraBold,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16
  },
  stripBody: {
    flex: 1,
    minWidth: 0
  },
  stripDisabled: {
    opacity: 0.58
  },
  stripPressed: {
    opacity: 0.72
  },
  viewText: {
    color: 'rgba(255,253,247,0.34)',
    fontFamily: fontFamilies.mono,
    fontSize: 9.5,
    lineHeight: 13
  }
});

const sheetStyles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  actionButtonDisabled: {
    opacity: 0.58
  },
  actionButtonDone: {
    backgroundColor: 'rgba(63,138,134,0.12)'
  },
  actionButtonPressed: {
    transform: [{ scale: 0.99 }]
  },
  actionButtonText: {
    color: PAPER_COLOR,
    fontFamily: fontFamilies.extraBold,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20
  },
  actionButtonTextDone: {
    color: MINA_COLOR
  },
  backdrop: {
    bottom: 0,
    justifyContent: 'flex-end',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  checkbox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: 'rgba(42,39,34,0.20)',
    borderRadius: 9,
    borderWidth: 2,
    flexShrink: 0,
    height: 28,
    justifyContent: 'center',
    width: 28
  },
  checkboxChecked: {
    backgroundColor: MINA_COLOR,
    borderColor: MINA_COLOR
  },
  checkboxDisabled: {
    opacity: 0.62
  },
  emptyState: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 36
  },
  emptyText: {
    color: colors.subtle,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center'
  },
  emptyTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22
  },
  footer: {
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingTop: 10
  },
  grabber: {
    backgroundColor: 'rgba(42,39,34,0.18)',
    borderRadius: 3,
    height: 5,
    width: 38
  },
  grabberWrap: {
    alignItems: 'center',
    alignSelf: 'center',
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 24,
    paddingBottom: 4,
    paddingTop: 9,
    width: 142
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingBottom: 14,
    paddingHorizontal: 20,
    paddingTop: 8
  },
  headerText: {
    flex: 1,
    gap: 5,
    minWidth: 0
  },
  list: {
    gap: 9,
    paddingBottom: 4,
    paddingHorizontal: 16,
    paddingTop: 10
  },
  meta: {
    color: colors.subtle,
    fontFamily: fontFamilies.mono,
    fontSize: 10,
    letterSpacing: 0.5,
    lineHeight: 13
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: 'rgba(42,39,34,0.07)',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  rowAmount: {
    color: colors.ink,
    flexShrink: 0,
    fontFamily: fontFamilies.monoBold,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    maxWidth: 96,
    minWidth: 72,
    textAlign: 'right'
  },
  rowAmountChecked: {
    color: '#C7BDAE',
    textDecorationLine: 'line-through'
  },
  rowChecked: {
    opacity: 0.9
  },
  rowMeta: {
    color: colors.subtle,
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 5
  },
  rowMetaChecked: {
    textDecorationLine: 'line-through'
  },
  rowPressed: {
    backgroundColor: 'rgba(42,39,34,0.015)'
  },
  rowReadonly: {
    opacity: 0.74
  },
  rowText: {
    flex: 1,
    minWidth: 0
  },
  scrim: {
    backgroundColor: 'rgba(26,23,19,0.42)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  scrimIos: {
    backgroundColor: 'rgba(26,23,19,0.30)'
  },
  scroll: {
    flexShrink: 1
  },
  sheet: {
    backgroundColor: colors.bg,
    borderRadius: 26,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    boxShadow: '0 -24px 60px -20px rgba(42,39,34,0.50)',
    display: 'flex',
    overflow: 'hidden'
  },
  sheetHitArea: {
    maxHeight: '100%'
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 25
  },
  toText: {
    color: colors.subtle,
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15
  },
  pillRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minWidth: 0
  },
  userPill: {
    borderRadius: theme.radii.pill,
    flexShrink: 1,
    justifyContent: 'center',
    maxWidth: 112,
    minHeight: 22,
    minWidth: 0,
    paddingHorizontal: 7,
    paddingVertical: 2
  },
  userPillText: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 9.5,
    fontWeight: '700',
    lineHeight: 14
  }
});
