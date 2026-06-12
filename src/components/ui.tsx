import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderInstance,
  type AccessibilityActionEvent,
  type StyleProp,
  type TextStyle,
  type ViewProps,
  type ViewStyle
} from 'react-native';

import {
  ExpenseContextMenu,
  type ExpenseContextMenuAction,
  type ExpenseContextMenuCard,
  type ExpenseContextMenuPoint,
  type ExpenseContextMenuRect
} from '@/src/components/ExpenseContextMenu';
import {
  EXPENSE_ROW_CARD_MIN_HEIGHT,
  ExpenseRowCardContent,
  type ExpenseRowCardContentData
} from '@/src/components/ExpenseRowCardContent';
import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { tintFromAccent } from '@/src/lib/color';

export type { ExpenseBadge } from '@/src/components/ExpenseRowCardContent';

type IoniconName = keyof typeof Ionicons.glyphMap;

type GlassSurfaceProps = ViewProps & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

type BentoVariant = 'default' | 'hero' | 'chart' | 'list' | 'form' | 'danger';

type BentoCardProps = GlassSurfaceProps & {
  variant?: BentoVariant;
};

type CardTopCapProps = {
  accent?: string;
  height?: number;
  insetHorizontal?: number;
  insetTop?: number;
  spacing?: number;
};

export type PillTabOption<T extends string> = {
  label: string;
  value: T;
  disabled?: boolean;
};

type PillTabsProps<T extends string> = {
  accessibilityLabel?: string;
  options: PillTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
};

type IconButtonProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  icon: IoniconName;
  onPress?: () => void;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'primary' | 'neutral' | 'danger';
  variant?: 'glass' | 'solid' | 'ghost';
};

type MetricTileProps = {
  accent?: string;
  helper?: string;
  icon?: IoniconName;
  label: string;
  style?: StyleProp<ViewStyle>;
  value: string;
};

type SettingsActionRowProps = {
  accent?: string;
  description?: string;
  disabled?: boolean;
  icon: IoniconName;
  onPress?: () => void;
  title: string;
  trailing?: ReactNode;
  tone?: 'primary' | 'neutral' | 'danger' | 'accent' | 'warm';
};

type SettingsSectionProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

type InsetActionRowProps = SettingsActionRowProps & {
  showDivider?: boolean;
};

type FilterChipProps = {
  active?: boolean;
  label: string;
  onPress: () => void;
};

type ToggleSwitchProps = {
  accessibilityLabel?: string;
  active: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

type SwipeExpenseRowProps = {
  compact?: boolean;
  content: ExpenseRowCardContentData;
  onDelete: () => void;
  onEdit: () => void;
  onSplitBreakdown?: () => void;
  onViewDetails?: () => void;
  subtitle?: string;
  timeLabel?: string;
  title?: string;
};

type ExpenseContextMenuState = {
  card: ExpenseContextMenuCard;
  rowRect: ExpenseContextMenuRect;
  touchPoint: ExpenseContextMenuPoint;
};

type GestureCoordinationState = {
  longPressHandled: boolean;
  panResponderActive: boolean;
  swipeActionHandled: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SWIPE_ACTION_WIDTH = 96;
const SWIPE_TRIGGER_DISTANCE = SWIPE_ACTION_WIDTH * 0.9;
const SWIPE_MAX_TRANSLATE = SWIPE_ACTION_WIDTH + 20;
const SWIPE_IDLE_THRESHOLD = 1;
const LONG_PRESS_DELAY_MS = 360;

function useLatestRef<T>(value: T) {
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  return valueRef;
}

export function GlassSurface({ children, style, ...viewProps }: GlassSurfaceProps) {
  return (
    <View {...viewProps} style={[uiStyles.glassSurface, style]}>
      {children}
    </View>
  );
}

export function BentoCard({ children, style, variant = 'default', ...viewProps }: BentoCardProps) {
  return (
    <GlassSurface {...viewProps} style={[uiStyles.bentoCard, bentoVariantStyles[variant], style]}>
      {children}
    </GlassSurface>
  );
}

export function CardTopCap({
  accent = colors.primary,
  height = 18,
  insetHorizontal = 16,
  insetTop = 16,
  spacing = 14
}: CardTopCapProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        uiStyles.cardTopCap,
        {
          backgroundColor: tintFromAccent(accent),
          height,
          marginBottom: spacing,
          marginHorizontal: -insetHorizontal,
          marginTop: -insetTop
        }
      ]}
    >
      <View style={[uiStyles.cardTopCapLine, { backgroundColor: accent }]} />
    </View>
  );
}

export function PillTabs<T extends string>({
  accessibilityLabel,
  options,
  size = 'md',
  value,
  onChange,
  style
}: PillTabsProps<T>) {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [indicatorTranslate] = useState(() => new Animated.Value(0));
  const [trackWidth, setTrackWidth] = useState(0);
  const indicatorInset = 3;
  const segmentWidth = options.length > 0 && trackWidth > 0 ? (trackWidth - indicatorInset * 2) / options.length : 0;
  const indicatorTransform = useMemo(
    () => [{ translateX: indicatorTranslate }],
    [indicatorTranslate]
  );

  useEffect(() => {
    if (segmentWidth <= 0) {
      indicatorTranslate.setValue(0);
      return;
    }

    Animated.spring(indicatorTranslate, {
      damping: 18,
      mass: 0.72,
      stiffness: 190,
      toValue: selectedIndex * segmentWidth,
      useNativeDriver: true
    }).start();
  }, [indicatorTranslate, segmentWidth, selectedIndex]);

  function handleLayout(event: LayoutChangeEvent) {
    setTrackWidth(event.nativeEvent.layout.width);
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      onLayout={handleLayout}
      style={[uiStyles.pillTrack, size === 'sm' && uiStyles.pillTrackSmall, style]}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            uiStyles.pillIndicator,
            {
              transform: indicatorTransform,
              width: segmentWidth
            }
          ]}
        />
      ) : null}

      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            disabled={option.disabled}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              uiStyles.pillOption,
              pressed && !option.disabled && uiStyles.pressed,
              option.disabled && uiStyles.disabled
            ]}
          >
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={[
                uiStyles.pillText,
                size === 'sm' && uiStyles.pillTextSmall,
                selected && uiStyles.pillTextActive,
                option.disabled && uiStyles.disabledText
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function IconButton({
  accessibilityLabel,
  disabled,
  icon,
  onPress,
  size = 'md',
  tone = 'neutral',
  variant = 'glass'
}: IconButtonProps) {
  const iconColor = iconColorFor(tone, variant, disabled);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        uiStyles.iconButton,
        uiStyles[`iconButton_${size}`],
        uiStyles[`iconButton_${variant}`],
        tone === 'danger' && uiStyles.iconButton_danger,
        tone === 'primary' && uiStyles.iconButton_primary,
        disabled && uiStyles.disabled,
        pressed && !disabled && uiStyles.iconButtonPressed
      ]}
    >
      <Ionicons color={iconColor} name={icon} size={size === 'sm' ? 17 : size === 'lg' ? 26 : 21} />
    </Pressable>
  );
}

export function MetricTile({ accent = colors.primary, helper, icon, label, style, value }: MetricTileProps) {
  return (
    <View style={[uiStyles.metricTile, style]}>
      <View style={uiStyles.metricHeader}>
        {icon ? (
          <View style={[uiStyles.metricIcon, { backgroundColor: tintFromAccent(accent) }]}>
            <Ionicons color={accent} name={icon} size={18} />
          </View>
        ) : null}
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text adjustsFontSizeToFit numberOfLines={1} style={uiStyles.metricValue}>
        {value}
      </Text>
      {helper ? <Text style={[styles.muted, uiStyles.metricHelper]}>{helper}</Text> : null}
    </View>
  );
}

export function SettingsActionRow({
  accent,
  description,
  disabled,
  icon,
  onPress,
  title,
  trailing,
  tone = 'primary'
}: SettingsActionRowProps) {
  const iconColor = accent || actionColorFor(tone);
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        uiStyles.actionRow,
        pressed && !disabled && uiStyles.actionRowPressed,
        disabled && uiStyles.disabled
      ]}
    >
      <View style={[uiStyles.actionIcon, { backgroundColor: tintFromAccent(iconColor) }]}>
        <Ionicons color={iconColor} name={icon} size={20} />
      </View>
      <View style={uiStyles.actionText}>
        <Text style={[uiStyles.actionTitle, tone === 'danger' && uiStyles.actionTitleDanger]}>{title}</Text>
        {description ? <Text style={styles.muted}>{description}</Text> : null}
      </View>
      {trailing || <Ionicons color={colors.subtle} name="chevron-forward" size={18} />}
    </Pressable>
  );
}

export function SettingsSection({ children, style }: SettingsSectionProps) {
  return <BentoCard style={[uiStyles.settingsSection, style]}>{children}</BentoCard>;
}

export function InsetActionRow({
  showDivider,
  ...props
}: InsetActionRowProps) {
  return (
    <View>
      <SettingsActionRow {...props} />
      {showDivider ? <View style={uiStyles.insetDivider} /> : null}
    </View>
  );
}

export function FilterChip({ active, label, onPress }: FilterChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        uiStyles.filterChip,
        active && uiStyles.filterChipActive,
        pressed && uiStyles.pressed
      ]}
    >
      <Ionicons
        color={active ? colors.primaryDark : colors.ink}
        name={active ? 'close' : 'chevron-down'}
        size={16}
      />
      <Text
        ellipsizeMode="tail"
        numberOfLines={1}
        style={[uiStyles.filterChipText, active && uiStyles.filterChipTextActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ToggleSwitch({
  accessibilityLabel,
  active,
  disabled = false,
  onPress,
  style
}: ToggleSwitchProps) {
  const switchVisual = (
    <View style={[uiStyles.toggleSwitchTrack, active && uiStyles.toggleSwitchTrackActive]}>
      <View style={[uiStyles.toggleSwitchThumb, active && uiStyles.toggleSwitchThumbActive]} />
    </View>
  );

  if (!onPress) {
    return <View style={[uiStyles.toggleSwitchButton, style]}>{switchVisual}</View>;
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        uiStyles.toggleSwitchButton,
        disabled && uiStyles.disabled,
        pressed && !disabled && uiStyles.pressed,
        style
      ]}
    >
      {switchVisual}
    </Pressable>
  );
}

export function SwipeExpenseRow({
  compact,
  content,
  onDelete,
  onEdit,
  onSplitBreakdown,
  onViewDetails
}: SwipeExpenseRowProps) {
  const [translateX] = useState(() => new Animated.Value(0));
  const [responder, setResponder] = useState<PanResponderInstance | null>(null);
  const [contextMenu, setContextMenu] = useState<ExpenseContextMenuState | null>(null);
  const rowRef = useRef<View | null>(null);
  const gestureStateRef = useRef<GestureCoordinationState>({
    longPressHandled: false,
    panResponderActive: false,
    swipeActionHandled: false
  });
  const actionsRef = useLatestRef({
    delete: onDelete,
    edit: onEdit,
    splitBreakdown: onSplitBreakdown,
    viewDetails: onViewDetails
  });

  useEffect(() => {
    setResponder(PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => isIntentionalHorizontalSwipe(
        gestureState.dx,
        gestureState.dy,
        gestureState.vx,
        gestureState.vy
      ),
      onPanResponderGrant: () => {
        gestureStateRef.current.panResponderActive = true;
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(clampSwipe(gestureState.dx));
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > SWIPE_TRIGGER_DISTANCE) {
          gestureStateRef.current.swipeActionHandled = true;
          gestureStateRef.current.panResponderActive = false;
          resetSwipe(translateX);
          actionsRef.current.edit();
          return;
        }

        if (gestureState.dx < -SWIPE_TRIGGER_DISTANCE) {
          gestureStateRef.current.swipeActionHandled = true;
          gestureStateRef.current.panResponderActive = false;
          resetSwipe(translateX);
          actionsRef.current.delete();
          return;
        }

        gestureStateRef.current.panResponderActive = false;
        resetSwipe(translateX);
      },
      onPanResponderTerminate: () => {
        gestureStateRef.current.panResponderActive = false;
        resetSwipe(translateX);
      },
      onPanResponderTerminationRequest: () => true
    }));
  }, [actionsRef, translateX]);

  function handlePressIn() {
    gestureStateRef.current.longPressHandled = false;
    gestureStateRef.current.swipeActionHandled = false;
  }

  function handlePress() {
    const gestureState = gestureStateRef.current;
    if (gestureState.longPressHandled || gestureState.panResponderActive || gestureState.swipeActionHandled) {
      return;
    }

    const currentTranslateX = currentAnimatedValue(translateX);
    translateX.stopAnimation();
    if (Math.abs(currentTranslateX) > SWIPE_IDLE_THRESHOLD) {
      resetSwipe(translateX);
    }

    actionsRef.current.edit();
  }

  function handleLongPress(event: GestureResponderEvent) {
    gestureStateRef.current.longPressHandled = true;

    const touchPoint = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY
    };
    const card = { ...content, compact };
    const row = rowRef.current;

    if (!row) {
      resetSwipe(translateX);
      setContextMenu({
        card,
        rowRect: fallbackRect(touchPoint),
        touchPoint
      });
      return;
    }

    row.measureInWindow((x, y, width, height) => {
      const measuredRect = isValidRect(x, y, width, height)
        ? { height, width, x, y }
        : fallbackRect(touchPoint);

      resetSwipe(translateX);
      setContextMenu({
        card,
        rowRect: measuredRect,
        touchPoint
      });
    });
  }

  function handleAccessibilityAction(event: AccessibilityActionEvent) {
    if (event.nativeEvent.actionName === 'viewDetails') {
      actionsRef.current.viewDetails?.();
    }

    if (event.nativeEvent.actionName === 'splitBreakdown') {
      actionsRef.current.splitBreakdown?.();
    }

    if (event.nativeEvent.actionName === 'edit') {
      actionsRef.current.edit();
    }

    if (event.nativeEvent.actionName === 'delete') {
      actionsRef.current.delete();
    }
  }

  const badgeLabels = content.badges.map((badge) => badge.label).join(', ');
  const accessibilityActions = [
    ...(onViewDetails ? [{ label: 'View details', name: 'viewDetails' }] : []),
    ...(onSplitBreakdown ? [{ label: 'Split breakdown', name: 'splitBreakdown' }] : []),
    { label: 'Edit', name: 'edit' },
    { label: 'Delete', name: 'delete' }
  ];
  const menuActions: ExpenseContextMenuAction[] = [
    ...(onViewDetails ? [{
      accessibilityLabel: 'View expense details',
      icon: 'information-circle-outline' as const,
      label: 'View details',
      onPress: () => actionsRef.current.viewDetails?.()
    }] : []),
    ...(onSplitBreakdown ? [{
      accessibilityLabel: 'View split breakdown',
      icon: 'git-branch-outline' as const,
      label: 'Split breakdown',
      onPress: () => actionsRef.current.splitBreakdown?.()
    }] : []),
    {
      accessibilityLabel: 'Edit expense',
      icon: 'create-outline',
      label: 'Edit',
      onPress: () => actionsRef.current.edit()
    },
    {
      accessibilityLabel: 'Delete expense',
      destructive: true,
      icon: 'trash-outline',
      label: 'Delete',
      onPress: () => actionsRef.current.delete()
    }
  ];
  const rowTitle = content.title || content.category;

  return (
    <View collapsable={false} ref={rowRef} style={uiStyles.swipeShell}>
      <View style={uiStyles.swipeActionLayer}>
        <View style={[uiStyles.swipeAction, uiStyles.swipeActionEdit]}>
          <Ionicons color="#FFFFFF" name="create-outline" size={22} />
        </View>
        <View style={[uiStyles.swipeAction, uiStyles.swipeActionDelete]}>
          <Ionicons color="#FFFFFF" name="trash-outline" size={22} />
        </View>
      </View>
      <AnimatedPressable
        accessibilityActions={accessibilityActions}
        accessibilityLabel={`${rowTitle}, ${content.dateLabel}, ${content.amount}, ${badgeLabels}`}
        accessibilityRole="button"
        onAccessibilityAction={handleAccessibilityAction}
        delayLongPress={LONG_PRESS_DELAY_MS}
        onLongPress={handleLongPress}
        onPress={handlePress}
        onPressIn={handlePressIn}
        {...(responder?.panHandlers || {})}
        style={[
          uiStyles.swipeCard,
          compact && uiStyles.swipeCardCompact,
          {
            transform: [{ translateX }]
          }
        ]}
      >
        <ExpenseRowCardContent
          {...content}
          compact={compact}
        />
      </AnimatedPressable>
      {contextMenu ? (
        <ExpenseContextMenu
          actions={menuActions}
          card={contextMenu.card}
          onClose={() => setContextMenu(null)}
          onDelete={() => actionsRef.current.delete()}
          onEdit={() => actionsRef.current.edit()}
          rowRect={contextMenu.rowRect}
          touchPoint={contextMenu.touchPoint}
        />
      ) : null}
    </View>
  );
}

function iconColorFor(tone: IconButtonProps['tone'], variant: IconButtonProps['variant'], disabled?: boolean) {
  if (disabled) {
    return colors.subtle;
  }

  if (variant === 'solid') {
    return '#FFFFFF';
  }

  if (tone === 'primary') {
    return colors.primaryDark;
  }

  if (tone === 'danger') {
    return colors.danger;
  }

  return colors.ink;
}

function actionColorFor(tone: SettingsActionRowProps['tone']) {
  if (tone === 'danger') {
    return colors.danger;
  }

  if (tone === 'accent') {
    return colors.accent;
  }

  if (tone === 'warm') {
    return colors.warm;
  }

  if (tone === 'neutral') {
    return colors.muted;
  }

  return colors.primaryDark;
}

function isIntentionalHorizontalSwipe(dx: number, dy: number, vx: number, vy: number) {
  const horizontalDistance = Math.abs(dx);
  const verticalDistance = Math.abs(dy);
  const horizontalVelocity = Math.abs(vx);
  const verticalVelocity = Math.abs(vy);

  if (horizontalDistance < 14) {
    return false;
  }

  return (
    horizontalDistance > verticalDistance * 1.8 ||
    (horizontalVelocity > 0.35 && horizontalVelocity > verticalVelocity * 1.4)
  );
}

function clampSwipe(value: number) {
  return Math.max(-SWIPE_MAX_TRANSLATE, Math.min(SWIPE_MAX_TRANSLATE, value));
}

function resetSwipe(value: Animated.Value) {
  Animated.spring(value, {
    damping: 18,
    mass: 0.8,
    stiffness: 180,
    toValue: 0,
    useNativeDriver: true
  }).start();
}

function currentAnimatedValue(value: Animated.Value) {
  const readableValue = value as Animated.Value & {
    __getValue?: () => number;
    _value?: number;
  };

  if (typeof readableValue.__getValue === 'function') {
    return readableValue.__getValue();
  }

  return typeof readableValue._value === 'number' ? readableValue._value : 0;
}

function isValidRect(x: number, y: number, width: number, height: number) {
  return Number.isFinite(x) && Number.isFinite(y) && width > 0 && height > 0;
}

function fallbackRect(touchPoint: ExpenseContextMenuPoint): ExpenseContextMenuRect {
  return {
    height: 0,
    width: 0,
    x: 20,
    y: Math.max(16, touchPoint.y - EXPENSE_ROW_CARD_MIN_HEIGHT / 2)
  };
}

const uiStyles = StyleSheet.create({
  actionIcon: {
    alignItems: 'center',
    backgroundColor: colors.tint,
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    width: 40
  },
  actionRow: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 0,
    flexDirection: 'row',
    gap: 12,
    minHeight: 84,
    paddingHorizontal: 20,
    paddingVertical: 14
  },
  actionRowPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.995 }]
  },
  actionText: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  actionTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22
  },
  actionTitleDanger: {
    color: colors.danger
  },
  bentoCard: {
    gap: 14
  },
  bentoCard_chart: {
    minHeight: 268
  },
  bentoCard_danger: {
    borderColor: 'rgba(220,38,38,0.18)'
  },
  bentoCard_default: {},
  bentoCard_form: {
    gap: 14
  },
  bentoCard_hero: {
    minHeight: 320,
    padding: 18
  },
  cardTopCap: {
    borderBottomColor: 'rgba(17,24,39,0.05)',
    borderBottomWidth: 1,
    justifyContent: 'flex-end',
    overflow: 'hidden'
  },
  cardTopCapLine: {
    borderBottomRightRadius: 999,
    height: 3,
    width: 78
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: colors.line,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    height: 44,
    justifyContent: 'center',
    minWidth: 112,
    paddingHorizontal: 16
  },
  filterChipActive: {
    backgroundColor: colors.tint,
    borderColor: colors.primary
  },
  filterChipText: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18
  },
  filterChipTextActive: {
    color: colors.primaryDark
  },
  bentoCard_list: {
    gap: 12
  },
  disabled: {
    opacity: 0.45
  },
  disabledText: {
    color: colors.subtle
  },
  glassSurface: {
    backgroundColor: colors.glass,
    borderColor: colors.glassBorder,
    borderRadius: theme.radii.surface,
    borderWidth: 1,
    padding: 16,
    ...theme.shadow
  },
  iconButton: {
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'center'
  },
  iconButton_danger: {
    borderColor: 'rgba(220,38,38,0.18)'
  },
  iconButton_ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent'
  },
  iconButton_glass: {
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: colors.line
  },
  iconButton_lg: {
    borderRadius: 22,
    height: 48,
    width: 48
  },
  iconButton_md: {
    borderRadius: 18,
    height: 38,
    width: 38
  },
  iconButton_primary: {
    borderColor: 'rgba(15,118,110,0.18)'
  },
  iconButton_sm: {
    borderRadius: 14,
    height: 30,
    width: 30
  },
  iconButton_solid: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  iconButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.96 }]
  },
  metricHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 28
  },
  metricHelper: {
    textAlign: 'left'
  },
  metricIcon: {
    alignItems: 'center',
    borderRadius: 12,
    height: 30,
    justifyContent: 'center',
    width: 30
  },
  metricTile: {
    gap: 6,
    minWidth: 0
  },
  metricValue: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 40
  },
  insetDivider: {
    backgroundColor: colors.line,
    height: 1,
    marginLeft: 72
  },
  pillIndicator: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: colors.line,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    bottom: 3,
    left: 3,
    position: 'absolute',
    top: 3,
    ...theme.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 10
  },
  pillOption: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    paddingHorizontal: 8,
    zIndex: 1
  },
  pillText: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center'
  } satisfies TextStyle,
  pillTextActive: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontWeight: '700'
  },
  pillTextSmall: {
    fontSize: 10,
    lineHeight: 14
  },
  pillTrack: {
    backgroundColor: 'rgba(15,118,110,0.08)',
    borderColor: colors.line,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    height: 38,
    overflow: 'hidden',
    position: 'relative'
  },
  pillTrackSmall: {
    borderRadius: theme.radii.pill,
    height: 30
  },
  pressed: {
    opacity: 0.76
  },
  settingsSection: {
    gap: 0,
    overflow: 'hidden',
    padding: 0
  },
  swipeAction: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    width: SWIPE_ACTION_WIDTH
  },
  swipeActionDelete: {
    backgroundColor: '#EF4444',
    right: 0
  },
  swipeActionEdit: {
    backgroundColor: colors.primary,
    left: 0
  },
  swipeActionLayer: {
    borderRadius: theme.radii.surface,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0
  },
  swipeCard: {
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderRadius: theme.radii.surface,
    borderWidth: 1,
    minHeight: 82,
    overflow: 'hidden',
    ...theme.shadow
  },
  swipeCardCompact: {
    borderRadius: 0,
    minHeight: 68,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0
  },
  swipeShell: {
    borderRadius: theme.radii.surface
  },
  toggleSwitchButton: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 44,
    width: 54
  },
  toggleSwitchThumb: {
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    height: 22,
    shadowColor: '#0F172A',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    width: 22
  },
  toggleSwitchThumbActive: {
    transform: [{ translateX: 20 }]
  },
  toggleSwitchTrack: {
    backgroundColor: 'rgba(17,24,39,0.16)',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 4,
    width: 50
  },
  toggleSwitchTrackActive: {
    backgroundColor: colors.primary
  }
});

const bentoVariantStyles: Record<BentoVariant, StyleProp<ViewStyle>> = {
  chart: uiStyles.bentoCard_chart,
  danger: uiStyles.bentoCard_danger,
  default: uiStyles.bentoCard_default,
  form: uiStyles.bentoCard_form,
  hero: uiStyles.bentoCard_hero,
  list: uiStyles.bentoCard_list
};
