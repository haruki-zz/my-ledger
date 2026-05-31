import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fontFamilies } from '@/src/components/styles';
import { tintFromAccent } from '@/src/lib/color';

export type ExpenseBadge = {
  accent: string;
  id: string;
  label: string;
};

type ExpenseRowCardContentProps = {
  amount: string;
  badges: ExpenseBadge[];
  category: string;
  dateLabel: string;
  style?: StyleProp<ViewStyle>;
};

export const EXPENSE_ROW_CARD_MIN_HEIGHT = 82;

export function ExpenseRowCardContent({
  amount,
  badges,
  category,
  dateLabel,
  style
}: ExpenseRowCardContentProps) {
  return (
    <View style={[rowCardStyles.content, style]}>
      <View style={rowCardStyles.textBlock}>
        <View style={rowCardStyles.titleRow}>
          <Text ellipsizeMode="tail" numberOfLines={1} style={rowCardStyles.category}>
            {category}
          </Text>
          <Text style={rowCardStyles.dateSeparator}>·</Text>
          <Text ellipsizeMode="tail" numberOfLines={1} style={rowCardStyles.date}>
            {dateLabel}
          </Text>
        </View>
        <View style={rowCardStyles.badgeRow}>
          {badges.map((badge) => (
            <View
              key={badge.id}
              style={[rowCardStyles.badge, { backgroundColor: tintFromAccent(badge.accent) }]}
            >
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={[rowCardStyles.badgeText, { color: badge.accent }]}
              >
                {badge.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <Text adjustsFontSizeToFit numberOfLines={1} style={rowCardStyles.amount}>
        {amount}
      </Text>
    </View>
  );
}

const rowCardStyles = StyleSheet.create({
  amount: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 28,
    maxWidth: 132,
    textAlign: 'right'
  },
  badge: {
    backgroundColor: 'rgba(15,118,110,0.10)',
    borderRadius: 8,
    flexShrink: 1,
    maxWidth: 116,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
    overflow: 'hidden'
  },
  badgeText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.extraBold,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15
  },
  category: {
    color: colors.ink,
    flexShrink: 1,
    fontFamily: fontFamilies.extraBold,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 23,
    minWidth: 0
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: EXPENSE_ROW_CARD_MIN_HEIGHT,
    paddingHorizontal: 18,
    paddingVertical: 13
  },
  date: {
    color: colors.muted,
    flexShrink: 0,
    fontFamily: fontFamilies.bold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18
  },
  dateSeparator: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18
  },
  textBlock: {
    flex: 1,
    gap: 7,
    justifyContent: 'center',
    minWidth: 0
  },
  titleRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 6,
    minWidth: 0
  }
});
