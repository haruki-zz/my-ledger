import { StyleSheet } from 'react-native';

import { CONTENT_BOTTOM_PADDING } from '@/src/components/layout';
import { CHART_PALETTE } from '@/src/lib/chartPalette';

export const theme = {
  colors: {
    accent: '#6366F1',
    bg: '#F6F8FB',
    danger: '#DC2626',
    glass: 'rgba(255,255,255,0.76)',
    glassBorder: 'rgba(255,255,255,0.72)',
    ink: '#111827',
    line: 'rgba(17,24,39,0.08)',
    muted: '#667085',
    primary: '#0F766E',
    primaryDark: '#115E59',
    subtle: '#98A2B3',
    surface: '#FFFFFF',
    tint: 'rgba(15,118,110,0.10)'
  },
  radii: {
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
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0
  },
  h1: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0
  },
  h2: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700'
  },
  body: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 23
  },
  muted: {
    color: colors.muted,
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
    ...theme.shadow
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    color: colors.ink,
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
    flex: 1,
    fontSize: 16,
    lineHeight: 23
  },
  dropdownPlaceholder: {
    color: colors.muted,
    flex: 1,
    fontSize: 16,
    lineHeight: 23
  },
  dropdownIndicator: {
    color: colors.muted,
    fontSize: 18,
    fontWeight: '700',
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
    fontSize: 16,
    lineHeight: 23
  },
  dropdownOptionTextActive: {
    color: colors.primaryDark,
    fontWeight: '800'
  },
  label: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700'
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
    fontSize: 16,
    fontWeight: '800'
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
    borderRadius: theme.radii.control,
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
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center'
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20
  }
});
