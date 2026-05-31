import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Alert,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type LayoutChangeEvent,
  type PanResponderInstance,
  type AccessibilityActionEvent,
  type StyleProp,
  type TextStyle,
  type ViewProps,
  type ViewStyle
} from 'react-native';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';

type IoniconName = keyof typeof Ionicons.glyphMap;

type GlassSurfaceProps = ViewProps & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

type BentoVariant = 'default' | 'hero' | 'chart' | 'list' | 'form' | 'danger';

type BentoCardProps = GlassSurfaceProps & {
  variant?: BentoVariant;
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
  accent?: ColorValue;
  helper?: string;
  icon?: IoniconName;
  label: string;
  style?: StyleProp<ViewStyle>;
  value: string;
};

type SettingsActionRowProps = {
  accent?: ColorValue;
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

export type ExpenseBadge = {
  accent: string;
  id: string;
  label: string;
};

type SwipeExpenseRowProps = {
  amount: string;
  badges: ExpenseBadge[];
  category: string;
  dateLabel: string;
  onDelete: () => void;
  onEdit: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SWIPE_ACTION_WIDTH = 96;
const SWIPE_TRIGGER_DISTANCE = SWIPE_ACTION_WIDTH * 0.9;
const SWIPE_MAX_TRANSLATE = SWIPE_ACTION_WIDTH + 20;

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

export function PillTabs<T extends string>({
  accessibilityLabel,
  options,
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
    <View accessibilityLabel={accessibilityLabel} onLayout={handleLayout} style={[uiStyles.pillTrack, style]}>
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

export function SwipeExpenseRow({
  amount,
  badges,
  category,
  dateLabel,
  onDelete,
  onEdit
}: SwipeExpenseRowProps) {
  const [translateX] = useState(() => new Animated.Value(0));
  const [responder, setResponder] = useState<PanResponderInstance | null>(null);
  const onDeleteRef = useRef(onDelete);
  const onEditRef = useRef(onEdit);

  useEffect(() => {
    onDeleteRef.current = onDelete;
  }, [onDelete]);

  useEffect(() => {
    onEditRef.current = onEdit;
  }, [onEdit]);

  useEffect(() => {
    setResponder(PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => isIntentionalHorizontalSwipe(
        gestureState.dx,
        gestureState.dy,
        gestureState.vx,
        gestureState.vy
      ),
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(clampSwipe(gestureState.dx));
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > SWIPE_TRIGGER_DISTANCE) {
          resetSwipe(translateX);
          onEditRef.current();
          return;
        }

        if (gestureState.dx < -SWIPE_TRIGGER_DISTANCE) {
          resetSwipe(translateX);
          onDeleteRef.current();
          return;
        }

        resetSwipe(translateX);
      },
      onPanResponderTerminate: () => {
        resetSwipe(translateX);
      },
      onPanResponderTerminationRequest: () => true
    }));
  }, [translateX]);

  function handleLongPress() {
    Alert.alert(`${category} · ${dateLabel}`, 'Choose an action for this expense.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Edit', onPress: () => onEditRef.current() },
      { text: 'Delete', onPress: () => onDeleteRef.current(), style: 'destructive' }
    ]);
  }

  function handleAccessibilityAction(event: AccessibilityActionEvent) {
    if (event.nativeEvent.actionName === 'edit') {
      onEditRef.current();
    }

    if (event.nativeEvent.actionName === 'delete') {
      onDeleteRef.current();
    }
  }

  const badgeLabels = badges.map((badge) => badge.label).join(', ');

  return (
    <View style={uiStyles.swipeShell}>
      <View style={uiStyles.swipeActionLayer}>
        <View style={[uiStyles.swipeAction, uiStyles.swipeActionEdit]}>
          <Ionicons color="#FFFFFF" name="create-outline" size={22} />
        </View>
        <View style={[uiStyles.swipeAction, uiStyles.swipeActionDelete]}>
          <Ionicons color="#FFFFFF" name="trash-outline" size={22} />
        </View>
      </View>
      <AnimatedPressable
        accessibilityActions={[
          { label: 'Edit', name: 'edit' },
          { label: 'Delete', name: 'delete' }
        ]}
        accessibilityLabel={`${category}, ${dateLabel}, ${amount}, ${badgeLabels}`}
        accessibilityRole="button"
        onAccessibilityAction={handleAccessibilityAction}
        onLongPress={handleLongPress}
        {...(responder?.panHandlers || {})}
        style={[
          uiStyles.swipeCard,
          {
            transform: [{ translateX }]
          }
        ]}
      >
        <View style={uiStyles.swipeContent}>
          <View style={uiStyles.swipeTextBlock}>
            <View style={uiStyles.swipeTitleRow}>
              <Text ellipsizeMode="tail" numberOfLines={1} style={uiStyles.swipeCategory}>
                {category}
              </Text>
              <Text style={uiStyles.swipeDateSeparator}>·</Text>
              <Text ellipsizeMode="tail" numberOfLines={1} style={uiStyles.swipeDate}>
                {dateLabel}
              </Text>
            </View>
            <View style={uiStyles.expenseBadgeRow}>
              {badges.map((badge) => (
                <View
                  key={badge.id}
                  style={[uiStyles.expenseBadge, { backgroundColor: tintFromAccent(badge.accent) }]}
                >
                  <Text
                    ellipsizeMode="tail"
                    numberOfLines={1}
                    style={[uiStyles.expenseBadgeText, { color: badge.accent }]}
                  >
                    {badge.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <Text adjustsFontSizeToFit numberOfLines={1} style={uiStyles.swipeAmount}>
            {amount}
          </Text>
        </View>
      </AnimatedPressable>
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

function tintFromAccent(accent: ColorValue) {
  if (typeof accent !== 'string') {
    return colors.tint;
  }

  const match = /^#([0-9a-fA-F]{6})$/.exec(accent);
  if (!match) {
    return colors.tint;
  }

  const [, hex] = match;
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},0.10)`;
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
    fontFamily: fontFamilies.extraBold,
    fontSize: 16,
    fontWeight: '800',
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
  expenseBadge: {
    flexShrink: 1,
    backgroundColor: 'rgba(15,118,110,0.10)',
    borderRadius: 8,
    maxWidth: 116,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  expenseBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
    overflow: 'hidden'
  },
  expenseBadgeText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.extraBold,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: colors.line,
    borderRadius: 18,
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
    fontFamily: fontFamilies.extraBold,
    fontSize: 14,
    fontWeight: '800',
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
    fontFamily: fontFamilies.extraBold,
    fontSize: 34,
    fontWeight: '900',
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
    borderRadius: 14,
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
    fontFamily: fontFamilies.extraBold,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    textAlign: 'center'
  } satisfies TextStyle,
  pillTextActive: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontWeight: '900'
  },
  pillTrack: {
    backgroundColor: 'rgba(15,118,110,0.08)',
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    height: 38,
    overflow: 'hidden',
    position: 'relative'
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
  swipeAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 28,
    maxWidth: 132,
    textAlign: 'right'
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
  swipeCategory: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 23,
    minWidth: 0
  },
  swipeContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 82,
    paddingHorizontal: 18,
    paddingVertical: 13
  },
  swipeDate: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18
  },
  swipeDateSeparator: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18
  },
  swipeShell: {
    borderRadius: theme.radii.surface
  },
  swipeTextBlock: {
    flex: 1,
    gap: 7,
    justifyContent: 'center',
    minWidth: 0
  },
  swipeTitleRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 6,
    minWidth: 0
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
