import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies } from '@/src/components/styles';

export type HistoryFilterOption = {
  label: string;
  value: string;
};

export type ActiveHistoryFilterChip = {
  key: string;
  label: string;
  onClear: () => void;
};

export function ActiveFilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <Pressable onPress={onClear} style={({ pressed }) => [filterStyles.activeFilterPill, pressed && filterStyles.pressed]}>
      <Text ellipsizeMode="tail" numberOfLines={1} style={filterStyles.activeFilterPillText}>{label}</Text>
      <Ionicons color={colors.primaryDark} name="close" size={15} />
    </Pressable>
  );
}

export function FilterControlButton({
  active,
  icon,
  label,
  onPress
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        filterStyles.filterControl,
        active && filterStyles.filterControlActive,
        pressed && filterStyles.pressed
      ]}
    >
      <Ionicons color={active ? colors.primaryDark : colors.ink} name={icon} size={19} />
      <Text ellipsizeMode="tail" numberOfLines={1} style={[filterStyles.filterControlText, active && filterStyles.filterControlTextActive]}>
        {label}
      </Text>
      <Ionicons color={active ? colors.primaryDark : colors.muted} name="chevron-down" size={16} />
    </Pressable>
  );
}

export function OptionList({
  emptyLabel,
  onChange,
  options,
  selectedValue
}: {
  emptyLabel: string;
  onChange: (value: string) => void;
  options: HistoryFilterOption[];
  selectedValue: string;
}) {
  const allOptions = [{ label: emptyLabel, value: '' }, ...options];

  return (
    <ScrollView nestedScrollEnabled style={filterStyles.dropdownMenuScroll}>
      {allOptions.map((option) => {
        const selected = option.value === selectedValue;
        return (
          <Pressable
            key={option.value || emptyLabel}
            onPress={() => onChange(option.value)}
            style={[filterStyles.optionRow, selected && filterStyles.optionRowActive]}
          >
            <Text ellipsizeMode="tail" numberOfLines={1} style={[filterStyles.optionText, selected && filterStyles.optionTextActive]}>
              {option.label}
            </Text>
            {selected ? <Ionicons color={colors.primaryDark} name="checkmark" size={19} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function CategoryList({
  onApply,
  onClear,
  onToggle,
  options,
  selectedCategories
}: {
  onApply: () => void;
  onClear: () => void;
  onToggle: (value: string) => void;
  options: HistoryFilterOption[];
  selectedCategories: Set<string>;
}) {
  return (
    <View style={filterStyles.categoryDropdown}>
      <View style={filterStyles.categoryDropdownHeader}>
        <Pressable onPress={onClear} style={filterStyles.categoryAllRow}>
          <Ionicons color={colors.primaryDark} name={selectedCategories.size === 0 ? 'remove' : 'close'} size={19} />
          <Text style={filterStyles.categoryAllText}>All Categories</Text>
        </Pressable>
        <Text style={filterStyles.categorySelectedText}>{selectedCategories.size} selected</Text>
      </View>
      <ScrollView nestedScrollEnabled style={filterStyles.dropdownMenuScroll}>
        {options.map((option) => {
          const selected = selectedCategories.has(option.value);
          return (
            <Pressable key={option.value} onPress={() => onToggle(option.value)} style={filterStyles.categoryOptionRow}>
              <View style={[filterStyles.checkbox, selected && filterStyles.checkboxActive]}>
                {selected ? <Ionicons color="#FFFFFF" name="checkmark" size={14} /> : null}
              </View>
              <Text ellipsizeMode="tail" numberOfLines={1} style={filterStyles.optionText}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable onPress={onApply} style={({ pressed }) => [filterStyles.applyButton, pressed && filterStyles.pressed]}>
        <Text style={filterStyles.applyButtonText}>Apply</Text>
      </Pressable>
    </View>
  );
}

const filterStyles = StyleSheet.create({
  activeFilterPill: {
    alignItems: 'center',
    backgroundColor: colors.tint,
    borderColor: 'rgba(15,118,110,0.16)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    maxWidth: 210,
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  activeFilterPillText: {
    color: colors.primaryDark,
    flexShrink: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16
  },
  applyButton: {
    alignItems: 'center',
    backgroundColor: colors.tint,
    borderRadius: 14,
    minHeight: 44,
    justifyContent: 'center'
  },
  applyButtonText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700'
  },
  categoryAllRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    minWidth: 0
  },
  categoryAllText: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19
  },
  categoryDropdown: {
    gap: 12
  },
  categoryDropdownHeader: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 10
  },
  categoryOptionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 40,
    paddingHorizontal: 2,
    paddingVertical: 8
  },
  categorySelectedText: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18
  },
  checkbox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: colors.subtle,
    borderRadius: 5,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    width: 20
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  dropdownMenuScroll: {
    maxHeight: 248
  },
  filterControl: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    height: 48,
    justifyContent: 'center',
    maxWidth: 210,
    minWidth: 122,
    paddingHorizontal: 14
  },
  filterControlActive: {
    backgroundColor: colors.tint,
    borderColor: 'rgba(15,118,110,0.18)'
  },
  filterControlText: {
    color: colors.ink,
    flexShrink: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18
  },
  filterControlTextActive: {
    color: colors.primaryDark
  },
  optionRow: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  optionRowActive: {
    backgroundColor: colors.tint
  },
  optionText: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    minWidth: 0
  },
  optionTextActive: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.bold,
    fontWeight: '700'
  },
  pressed: {
    opacity: 0.76
  }
});
