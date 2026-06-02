import { BlurView } from 'expo-blur';
import { Component, useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, styles, theme } from '@/src/components/styles';
import {
  TRANSFER_OVERLAY_MAX_WIDTH,
  TransferItemCard,
  completedAtForUser,
  counterpartyForUser,
  isParticipant
} from '@/src/components/TransferChecklistShared';
import { IconButton } from '@/src/components/ui';
import type { TransferChecklistItemRow } from '@/src/types/database';

type TransferItemsOverlayProps = {
  currentUserId: string | null;
  items: TransferChecklistItemRow[];
  onClose: () => void;
  onToggleItem: (item: TransferChecklistItemRow) => void;
  saving: boolean;
  userName: (userId: string | null) => string;
  visible: boolean;
};

type BlurFallbackBoundaryProps = {
  children: ReactNode;
};

type BlurFallbackBoundaryState = {
  failed: boolean;
};

const OVERLAY_ENTER_DURATION_MS = 170;
const OVERLAY_EXIT_DURATION_MS = 130;

export function TransferItemsOverlay({
  currentUserId,
  items,
  onClose,
  onToggleItem,
  saving,
  userName,
  visible
}: TransferItemsOverlayProps) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const [rendered, setRendered] = useState(visible);
  const [closing, setClosing] = useState(false);
  const [transitionProgress] = useState(() => new Animated.Value(0));
  const overlayContentWidth = Math.min(width - 32, TRANSFER_OVERLAY_MAX_WIDTH);
  const panelMaxHeight = Math.max(240, height - insets.top - insets.bottom - 36);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setRendered(true);
    setClosing(false);
    transitionProgress.setValue(0);
    Animated.timing(transitionProgress, {
      duration: OVERLAY_ENTER_DURATION_MS,
      toValue: 1,
      useNativeDriver: true
    }).start();
  }, [transitionProgress, visible]);

  useEffect(() => {
    if (visible || !rendered || closing) {
      return;
    }

    setClosing(true);
    transitionProgress.stopAnimation();
    Animated.timing(transitionProgress, {
      duration: OVERLAY_EXIT_DURATION_MS,
      toValue: 0,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (!finished) {
        setClosing(false);
        return;
      }

      setRendered(false);
      setClosing(false);
    });
  }, [closing, rendered, transitionProgress, visible]);

  if (!rendered) {
    return null;
  }

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible>
      <Pressable
        accessibilityLabel="Close transfer items"
        accessibilityRole="button"
        onPress={onClose}
        style={overlayStyles.backdrop}
      >
        {Platform.OS === 'ios' ? (
          <BlurFallbackBoundary>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: transitionProgress }]}>
              <BlurView intensity={28} style={StyleSheet.absoluteFill} tint="light" />
            </Animated.View>
          </BlurFallbackBoundary>
        ) : null}
        <Animated.View
          pointerEvents="none"
          style={[
            overlayStyles.fallback,
            Platform.OS === 'ios' && overlayStyles.fallbackIos,
            { opacity: transitionProgress }
          ]}
        />

        <Pressable
          accessibilityLabel="Transfer items"
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={[
            overlayStyles.panelHitArea,
            {
              maxHeight: panelMaxHeight,
              width: overlayContentWidth
            }
          ]}
        >
          <Animated.View
            style={[
              overlayStyles.panel,
              {
                maxHeight: panelMaxHeight,
                opacity: transitionProgress,
                transform: [
                  {
                    translateY: transitionProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [14, 0]
                    })
                  },
                  {
                    scale: transitionProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1]
                    })
                  }
                ]
              }
            ]}
          >
            <View style={overlayStyles.header}>
              <View style={overlayStyles.titleGroup}>
                <Text style={styles.h2}>Transfer items</Text>
                <Text style={styles.muted}>
                  {items.length} open {items.length === 1 ? 'item' : 'items'}
                </Text>
              </View>
              <IconButton
                accessibilityLabel="Close transfer items"
                icon="close"
                onPress={onClose}
                size="sm"
                tone="neutral"
              />
            </View>

            <ScrollView
              contentContainerStyle={overlayStyles.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={overlayStyles.scrollView}
            >
              {items.map((item) => {
                const currentCompleted = Boolean(completedAtForUser(item, currentUserId));
                const counterpartyUserId = counterpartyForUser(item, currentUserId);
                const counterpartyCompleted = Boolean(completedAtForUser(item, counterpartyUserId));
                const canToggle = Boolean(currentUserId && isParticipant(item, currentUserId));

                return (
                  <TransferItemCard
                    canToggle={canToggle}
                    counterpartyCompleted={counterpartyCompleted}
                    counterpartyUserId={counterpartyUserId}
                    currentCompleted={currentCompleted}
                    item={item}
                    key={item.expense_id}
                    onToggle={() => onToggleItem(item)}
                    saving={saving}
                    showToggle
                    userName={userName}
                  />
                );
              })}
            </ScrollView>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
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

const overlayStyles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  fallback: {
    backgroundColor: 'rgba(246,248,251,0.88)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  fallbackIos: {
    backgroundColor: 'rgba(246,248,251,0.30)'
  },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingBottom: 14
  },
  list: {
    gap: 12,
    paddingTop: 14
  },
  panel: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: colors.glassBorder,
    borderRadius: theme.radii.surface,
    borderWidth: 1,
    gap: 0,
    padding: 16,
    ...theme.shadow
  },
  panelHitArea: {
    maxHeight: '100%'
  },
  scrollView: {
    flexShrink: 1
  },
  titleGroup: {
    flex: 1,
    gap: 2,
    minWidth: 0
  }
});
