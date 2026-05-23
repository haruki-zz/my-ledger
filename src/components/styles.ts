import { StyleSheet } from 'react-native';

export const colors = {
  ink: '#17202A',
  muted: '#697586',
  line: '#D8DEE8',
  bg: '#F5F7FA',
  surface: '#FFFFFF',
  primary: '#1F7A8C',
  primaryDark: '#155E6F',
  danger: '#B42318',
  tint: '#E6F3F6'
};

export const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 32
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '800'
  },
  h1: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800'
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
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
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
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
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
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden'
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
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  secondaryButton: {
    backgroundColor: colors.tint,
    borderColor: colors.primary,
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
    borderRadius: 8,
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
