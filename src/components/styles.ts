import { Platform, StyleSheet } from 'react-native';

import { CONTENT_BOTTOM_PADDING } from '@/src/components/layout';
import { CHART_PALETTE } from '@/src/lib/chartPalette';

export const fontFamilies = {
  regular: 'JetBrainsMono_400Regular',
  semiBold: 'JetBrainsMono_600SemiBold',
  bold: 'JetBrainsMono_700Bold',
  extraBold: 'JetBrainsMono_800ExtraBold',
  fallback: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace'
  })
} as const;

export const theme = {
  colors: {
    accent: '#6366F1',
    bg: '#EBEFF7',
    danger: '#DC2626',
    glass: '#FFFFFF',
    glassBorder: 'rgba(255,255,255,0.9)',
    ink: '#111827',
    line: 'rgba(17,24,39,0.08)',
    muted: '#667085',
    primary: '#0F766E',
    primaryDark: '#115E59',
    subtle: '#98A2B3',
    surface: '#FFFFFF',
    tint: 'rgba(15,118,110,0.10)',
    warm: '#C2410C'
  },
  radii: {
    pill: 999,
    control: 16,
    compact: 12,
    surface: 20
  },
  shadow: {
    elevation: 3,
    shadowColor: '#0F172A',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 24
  },
  glassShadow: {
    boxShadow: '0 2px 5px rgba(15,23,42,0.05), 0 20px 36px -12px rgba(15,23,42,0.24)',
    elevation: 4,
    shadowColor: '#0F172A',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 28
  },
  daySectionShadow: {
    boxShadow: '0 14px 30px -14px rgba(15,23,42,0.20)',
    elevation: 3,
    shadowColor: '#0F172A',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 22
  },
  chart: {
    grid: 'rgba(17,24,39,0.08)',
    palette: CHART_PALETTE,
    primary: '#0F766E',
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
    borderColor: colors.primary
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
    color: colors.primaryDark,
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
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
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
    borderColor: colors.primary
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
