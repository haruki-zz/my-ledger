import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  EXPENSE_ROW_CARD_MIN_HEIGHT,
  ExpenseRowCardContent,
  type ExpenseRowCardContentData
} from '@/src/components/ExpenseRowCardContent';
import { colors, fontFamilies, theme } from '@/src/components/styles';
import { clampToRange } from '@/src/lib/math';

export type ExpenseContextMenuCard = ExpenseRowCardContentData & {
  compact?: boolean;
};

export type ExpenseContextMenuPoint = {
  x: number;
  y: number;
};

export type ExpenseContextMenuRect = ExpenseContextMenuPoint & {
  height: number;
  width: number;
};

export type ExpenseContextMenuAction = {
  accessibilityLabel: string;
  destructive?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
};

type ExpenseContextMenuProps = {
  actions?: ExpenseContextMenuAction[];
  card: ExpenseContextMenuCard;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  rowRect: ExpenseContextMenuRect;
  touchPoint: ExpenseContextMenuPoint;
};

type BlurFallbackBoundaryProps = {
  children: ReactNode;
};

type BlurFallbackBoundaryState = {
  failed: boolean;
};

const MENU_WIDTH = 184;
const QUICK_ACTION_HEIGHT = 52;
const MENU_DIVIDER_HEIGHT = 1;
const MENU_GAP = 16;
const SCREEN_MARGIN = 16;
const PREVIEW_SCALE = 1.05;

export function ExpenseContextMenu({
  actions,
  card,
  onClose,
  onDelete,
  onEdit,
  rowRect,
  touchPoint
}: ExpenseContextMenuProps) {
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [transitionProgress] = useState(() => new Animated.Value(0));
  const [closing, setClosing] = useState(false);
  const menuActions = useMemo<ExpenseContextMenuAction[]>(() => (
    actions || [
      {
        accessibilityLabel: 'Edit expense',
        icon: 'create-outline',
        label: 'Edit',
        onPress: onEdit
      },
      {
        accessibilityLabel: 'Delete expense',
        destructive: true,
        icon: 'trash-outline',
        label: 'Delete',
        onPress: onDelete
      }
    ]
  ), [actions, onDelete, onEdit]);
  const menuHeight = menuHeightForActions(menuActions.length);
  const layout = useMemo(() => (
    contextMenuLayout(rowRect, touchPoint, screenWidth, screenHeight, insets.bottom, menuHeight)
  ), [insets.bottom, menuHeight, rowRect, screenHeight, screenWidth, touchPoint]);
  const canRenderIosBlur = Platform.OS === 'ios' && Boolean(BlurView);

  useEffect(() => {
    transitionProgress.setValue(0);
    Animated.timing(transitionProgress, {
      duration: 170,
      toValue: 1,
      useNativeDriver: true
    }).start();
  }, [transitionProgress]);

  const overlayAnimatedStyle = {
    opacity: transitionProgress
  };
  const previewAnimatedStyle = {
    opacity: transitionProgress,
    transform: [
      {
        scale: transitionProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [1, PREVIEW_SCALE]
        })
      }
    ]
  };
  const menuAnimatedStyle = {
    opacity: transitionProgress,
    transform: [
      {
        translateY: transitionProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 0]
        })
      },
      {
        scale: transitionProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1]
        })
      }
    ]
  };

  function closeMenu(action?: () => void) {
    if (closing) {
      return;
    }

    setClosing(true);
    transitionProgress.stopAnimation();
    Animated.timing(transitionProgress, {
      duration: 130,
      toValue: 0,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (!finished) {
        setClosing(false);
        return;
      }

      onClose();
      if (action) {
        requestAnimationFrame(action);
      }
    });
  }

  return (
    <Modal animationType="none" onRequestClose={() => closeMenu()} transparent visible>
      <Pressable
        accessibilityLabel="Close menu"
        accessibilityRole="button"
        onPress={() => closeMenu()}
        style={contextMenuStyles.backdrop}
      >
        {canRenderIosBlur ? (
          <BlurFallbackBoundary>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, overlayAnimatedStyle]}>
              <BlurView intensity={34} style={StyleSheet.absoluteFill} tint="light" />
            </Animated.View>
          </BlurFallbackBoundary>
        ) : null}
        <Animated.View
          pointerEvents="none"
          style={[
            contextMenuStyles.fallbackOverlay,
            Platform.OS === 'ios' && contextMenuStyles.iosOverlay,
            overlayAnimatedStyle
          ]}
        />

        <Animated.View
          pointerEvents="none"
          style={[
            contextMenuStyles.previewCard,
            {
              height: layout.preview.height,
              left: layout.preview.x,
              top: layout.preview.y,
              width: layout.preview.width
            },
            previewAnimatedStyle
          ]}
        >
          <ExpenseRowCardContent {...card} />
        </Animated.View>

        <Pressable
          accessibilityLabel="Expense actions"
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={[
            contextMenuStyles.menuHitArea,
            {
              left: layout.menu.x,
              top: layout.menu.y,
              width: MENU_WIDTH
            }
          ]}
        >
          <Animated.View style={[contextMenuStyles.menu, menuAnimatedStyle]}>
            {menuActions.map((action, index) => (
              <View key={`${action.label}-${index}`}>
                {index > 0 ? <View style={contextMenuStyles.menuDivider} /> : null}
                <QuickAction
                  accessibilityLabel={action.accessibilityLabel}
                  destructive={action.destructive}
                  icon={action.icon}
                  label={action.label}
                  onPress={() => closeMenu(action.onPress)}
                />
              </View>
            ))}
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

function QuickAction({ accessibilityLabel, destructive, icon, label, onPress }: QuickActionProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        contextMenuStyles.quickAction,
        pressed && contextMenuStyles.quickActionPressed
      ]}
    >
      <Ionicons color={destructive ? colors.danger : colors.ink} name={icon} size={20} />
      <Text style={[contextMenuStyles.quickActionText, destructive && contextMenuStyles.quickActionTextDanger]}>
        {label}
      </Text>
    </Pressable>
  );
}

type QuickActionProps = ExpenseContextMenuAction;

function menuHeightForActions(actionCount: number) {
  if (actionCount <= 0) {
    return 0;
  }

  return actionCount * QUICK_ACTION_HEIGHT + (actionCount - 1) * MENU_DIVIDER_HEIGHT;
}

function contextMenuLayout(
  rowRect: ExpenseContextMenuRect,
  touchPoint: ExpenseContextMenuPoint,
  screenWidth: number,
  screenHeight: number,
  bottomInset: number,
  menuHeight: number
) {
  const previewWidth = rowRect.width > 0 ? rowRect.width : Math.max(screenWidth - 40, 280);
  const previewHeight = rowRect.height > 0 ? rowRect.height : EXPENSE_ROW_CARD_MIN_HEIGHT;
  const previewX = clampToRange(rowRect.x, SCREEN_MARGIN, screenWidth - previewWidth - SCREEN_MARGIN);
  const previewY = clampToRange(rowRect.y, SCREEN_MARGIN, screenHeight - previewHeight - bottomInset - SCREEN_MARGIN);
  const menuX = clampToRange(
    touchPoint.x - MENU_WIDTH / 2,
    SCREEN_MARGIN,
    screenWidth - MENU_WIDTH - SCREEN_MARGIN
  );
  const availableBelow = screenHeight - bottomInset - touchPoint.y - MENU_GAP;
  const menuY = availableBelow >= menuHeight
    ? touchPoint.y + MENU_GAP
    : touchPoint.y - menuHeight - MENU_GAP;

  return {
    menu: {
      x: menuX,
      y: clampToRange(menuY, SCREEN_MARGIN, screenHeight - menuHeight - bottomInset - SCREEN_MARGIN)
    },
    preview: {
      height: previewHeight,
      width: previewWidth,
      x: previewX,
      y: previewY
    }
  };
}

const contextMenuStyles = StyleSheet.create({
  backdrop: {
    flex: 1
  },
  fallbackOverlay: {
    bottom: 0,
    backgroundColor: 'rgba(23,32,42,0.46)',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  iosOverlay: {
    backgroundColor: 'rgba(23,32,42,0.22)'
  },
  menu: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 18
  },
  menuDivider: {
    backgroundColor: colors.line,
    height: MENU_DIVIDER_HEIGHT,
    marginLeft: 48
  },
  menuHitArea: {
    position: 'absolute'
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderRadius: theme.radii.surface,
    borderWidth: 1,
    minHeight: EXPENSE_ROW_CARD_MIN_HEIGHT,
    overflow: 'hidden',
    position: 'absolute',
    ...theme.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 28
  },
  quickAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    height: QUICK_ACTION_HEIGHT,
    paddingHorizontal: 16
  },
  quickActionPressed: {
    backgroundColor: colors.tint
  },
  quickActionText: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  quickActionTextDanger: {
    color: colors.danger
  }
});
