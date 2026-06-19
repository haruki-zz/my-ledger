import { Platform, StyleSheet } from 'react-native';

import { CONTENT_BOTTOM_PADDING } from '@/src/components/layout';
import { CHART_PALETTE } from '@/src/lib/chartPalette';

export const fontFamilies = {
  mono: 'JetBrainsMono_400Regular',
  monoSemiBold: 'JetBrainsMono_600SemiBold',
  monoBold: 'JetBrainsMono_700Bold',
  monoExtraBold: 'JetBrainsMono_800ExtraBold',
  regular: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semiBold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
  extraBold: 'HankenGrotesk_800ExtraBold',
  fallback: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace'
  })
} as const;

export const theme = {
  colors: {
    accent: '#C0892E',
    bg: '#F1ECE3',
    danger: '#C0392B',
    glass: '#FFFFFF',
    glassBorder: 'rgba(42,39,34,0.06)',
    info: '#3F6FA0',
    ink: '#2A2722',
    line: 'rgba(42,39,34,0.10)',
    muted: '#5C544A',
    primary: '#3A322A',
    primaryDark: '#2A241E',
    secondary: '#C0892E',
    subtle: '#9A8F80',
    success: '#3D8A5E',
    surface: '#FFFFFF',
    tint: 'rgba(192,137,46,0.12)',
    warning: '#D2741F'
  },
  radii: {
    pill: 999,
    control: 16,
    compact: 12,
    surface: 20
  },
  shadow: {
    elevation: 3,
    shadowColor: '#2A2722',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 24
  },
  glassShadow: {
    boxShadow: '0 2px 5px rgba(42,39,34,0.05), 0 20px 36px -12px rgba(42,39,34,0.24)',
    elevation: 4,
    shadowColor: '#2A2722',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 28
  },
  daySectionShadow: {
    boxShadow: '0 14px 30px -14px rgba(42,39,34,0.20)',
    elevation: 3,
    shadowColor: '#2A2722',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 22
  },
  chart: {
    grid: 'rgba(42,39,34,0.10)',
    palette: CHART_PALETTE,
    primary: '#B25A3C',
    donutCenter: 'rgba(255,255,255,0.92)'
  }
};

export const colors = theme.colors;

export const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    alignSelf: 'center',
    gap: 18,
    maxWidth: 1040,
    padding: 20,
    paddingBottom: CONTENT_BOTTOM_PADDING,
    width: '100%'
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 0
  },
  h1: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0
  },
  h2: {
    color: colors.ink,
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    fontWeight: '600'
  },
  body: {
    color: colors.ink,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 23
  },
  muted: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20
  },
  section: {
    backgroundColor: colors.glass,
    borderColor: colors.glassBorder,
    borderRadius: theme.radii.surface,
    borderWidth: 1,
    gap: 12,
    padding: 16,
    ...theme.glassShadow
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  dropdown: {
    gap: 8
  },
  dropdownTrigger: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  dropdownTriggerActive: {
    borderColor: colors.secondary
  },
  dropdownValue: {
    color: colors.ink,
    fontFamily: fontFamilies.regular,
    flex: 1,
    fontSize: 16,
    lineHeight: 23
  },
  dropdownPlaceholder: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    flex: 1,
    fontSize: 16,
    lineHeight: 23
  },
  dropdownIndicator: {
    color: colors.muted,
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 23,
    marginLeft: 10
  },
  dropdownMenu: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadow
  },
  dropdownOption: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  dropdownOptionActive: {
    backgroundColor: colors.tint
  },
  dropdownOptionText: {
    color: colors.ink,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 23
  },
  dropdownOptionTextActive: {
    color: colors.secondary,
    fontFamily: fontFamilies.bold,
    fontWeight: '700'
  },
  label: {
    color: colors.ink,
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    fontWeight: '600'
  },
  upperLabel: {
    color: '#7A6F60',
    fontFamily: fontFamilies.bold,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    lineHeight: 14,
    textTransform: 'uppercase'
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: theme.radii.control,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: colors.line,
    borderWidth: 1
  },
  dangerButton: {
    backgroundColor: colors.danger
  },
  buttonText: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.bold,
    fontSize: 16,
    fontWeight: '700'
  },
  secondaryButtonText: {
    color: colors.primaryDark
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10
  },
  between: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  chip: {
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  chipActive: {
    backgroundColor: colors.tint,
    borderColor: colors.secondary
  },
  chipText: {
    color: colors.ink,
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center'
  },
  error: {
    color: colors.danger,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20
  }
});
