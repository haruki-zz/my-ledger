import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type LayoutChangeEvent,
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
  description?: string;
  disabled?: boolean;
  icon: IoniconName;
  onPress?: () => void;
  title: string;
  trailing?: ReactNode;
};

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
  description,
  disabled,
  icon,
  onPress,
  title,
  trailing
}: SettingsActionRowProps) {
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
      <View style={uiStyles.actionIcon}>
        <Ionicons color={colors.primaryDark} name={icon} size={20} />
      </View>
      <View style={uiStyles.actionText}>
        <Text style={uiStyles.actionTitle}>{title}</Text>
        {description ? <Text style={styles.muted}>{description}</Text> : null}
      </View>
      {trailing || <Ionicons color={colors.subtle} name="chevron-forward" size={18} />}
    </Pressable>
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
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    padding: 12
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
