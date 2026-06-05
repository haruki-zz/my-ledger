import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fontFamilies } from '@/src/components/styles';
import { tintFromAccent } from '@/src/lib/color';

export type ExpenseBadge = {
  accent: string;
  id: string;
  label: string;
};

export type ExpenseRowCardContentData = {
  amount: string;
  badges: ExpenseBadge[];
  category: string;
  dateLabel: string;
  leadingIcon?: keyof typeof Ionicons.glyphMap;
  leadingIconColor?: string;
  subtitle?: string;
  timeLabel?: string;
  title?: string;
};

type ExpenseRowCardContentProps = ExpenseRowCardContentData & {
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export const EXPENSE_ROW_CARD_MIN_HEIGHT = 82;

export function ExpenseRowCardContent({
  amount,
  badges,
  category,
  compact,
  dateLabel,
  leadingIcon,
  leadingIconColor = colors.primaryDark,
  subtitle,
  timeLabel,
  title,
  style
}: ExpenseRowCardContentProps) {
  const rowTitle = title || category;
  const rowSubtitle = subtitle || (title ? category : undefined);

  if (compact) {
    return (
      <CompactRowContent
        amount={amount}
        badges={badges}
        category={category}
        dateLabel={dateLabel}
        leadingIcon={leadingIcon}
        leadingIconColor={leadingIconColor}
        rowSubtitle={rowSubtitle}
        rowTitle={rowTitle}
        style={style}
        timeLabel={timeLabel}
      />
    );
  }

  return (
    <StandardRowContent
      amount={amount}
      badges={badges}
      category={category}
      dateLabel={dateLabel}
      leadingIcon={leadingIcon}
      leadingIconColor={leadingIconColor}
      rowSubtitle={rowSubtitle}
      rowTitle={rowTitle}
      style={style}
      timeLabel={timeLabel}
    />
  );
}

type RowContentLayoutProps = ExpenseRowCardContentData & {
  rowSubtitle?: string;
  rowTitle: string;
  style?: StyleProp<ViewStyle>;
};

function StandardRowContent({
  amount,
  badges,
  dateLabel,
  leadingIcon,
  leadingIconColor = colors.primaryDark,
  rowSubtitle,
  rowTitle,
  style,
  timeLabel
}: RowContentLayoutProps) {
  return (
    <View style={[rowCardStyles.content, style]}>
      {leadingIcon ? (
        <View style={[rowCardStyles.leadingIcon, { backgroundColor: tintFromAccent(leadingIconColor) }]}>
          <Ionicons color={leadingIconColor} name={leadingIcon} size={22} />
        </View>
      ) : null}
      {timeLabel ? (
        <Text ellipsizeMode="tail" numberOfLines={1} style={rowCardStyles.time}>
          {timeLabel}
        </Text>
      ) : null}
      <View style={rowCardStyles.textBlock}>
        <View style={rowCardStyles.titleRow}>
          <Text ellipsizeMode="tail" numberOfLines={1} style={rowCardStyles.category}>
            {rowTitle}
          </Text>
          {!timeLabel ? (
            <>
              <Text style={rowCardStyles.dateSeparator}>·</Text>
              <Text ellipsizeMode="tail" numberOfLines={1} style={rowCardStyles.date}>
                {dateLabel}
              </Text>
            </>
          ) : null}
        </View>
        {rowSubtitle ? (
          <Text ellipsizeMode="tail" numberOfLines={1} style={rowCardStyles.subtitle}>
            {rowSubtitle}
          </Text>
        ) : null}
        <BadgeRow badges={badges} />
      </View>
      <View style={rowCardStyles.amountBlock}>
        <Text adjustsFontSizeToFit numberOfLines={1} style={rowCardStyles.amount}>
          {amount}
        </Text>
      </View>
    </View>
  );
}

function CompactRowContent({
  amount,
  badges,
  leadingIcon,
  leadingIconColor = colors.primaryDark,
  rowSubtitle,
  rowTitle,
  style,
  timeLabel
}: RowContentLayoutProps) {
  return (
    <View style={[rowCardStyles.content, rowCardStyles.contentCompact, style]}>
      {leadingIcon ? (
        <View style={[rowCardStyles.leadingIcon, rowCardStyles.leadingIconCompact, { backgroundColor: tintFromAccent(leadingIconColor) }]}>
          <Ionicons color={leadingIconColor} name={leadingIcon} size={20} />
        </View>
      ) : null}
      {timeLabel ? (
        <Text ellipsizeMode="tail" numberOfLines={1} style={[rowCardStyles.time, rowCardStyles.timeCompact]}>
          {timeLabel}
        </Text>
      ) : null}
      <View style={rowCardStyles.textBlock}>
        <Text ellipsizeMode="tail" numberOfLines={1} style={[rowCardStyles.category, rowCardStyles.categoryCompact]}>
          {rowTitle}
        </Text>
        {rowSubtitle ? (
          <Text ellipsizeMode="tail" numberOfLines={1} style={[rowCardStyles.subtitle, rowCardStyles.subtitleCompact]}>
            {rowSubtitle}
          </Text>
        ) : null}
      </View>
      <View style={[rowCardStyles.amountBlock, rowCardStyles.amountBlockCompact]}>
        <Text adjustsFontSizeToFit numberOfLines={1} style={[rowCardStyles.amount, rowCardStyles.amountCompact]}>
          {amount}
        </Text>
        <BadgeRow badges={badges.slice(0, 2)} compact />
      </View>
    </View>
  );
}

function BadgeRow({ badges, compact }: { badges: ExpenseBadge[]; compact?: boolean }) {
  return (
    <View style={[rowCardStyles.badgeRow, compact && rowCardStyles.badgeRowCompact]}>
      {badges.map((badge) => (
        <View
          key={badge.id}
          style={[rowCardStyles.badge, compact && rowCardStyles.badgeCompact, { backgroundColor: tintFromAccent(badge.accent) }]}
        >
          <Text
            ellipsizeMode="tail"
            numberOfLines={1}
            style={[rowCardStyles.badgeText, compact && rowCardStyles.badgeTextCompact, { color: badge.accent }]}
          >
            {badge.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const rowCardStyles = StyleSheet.create({
  amount: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 28,
    maxWidth: 132,
    textAlign: 'right'
  },
  amountBlock: {
    alignItems: 'flex-end',
    gap: 5,
    minWidth: 0
  },
  amountBlockCompact: {
    maxWidth: 118
  },
  amountCompact: {
    fontSize: 19,
    lineHeight: 24,
    maxWidth: 118
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
  badgeRowCompact: {
    gap: 4,
    justifyContent: 'flex-end',
    maxWidth: 118
  },
  badgeCompact: {
    borderRadius: 7,
    maxWidth: 72,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  badgeText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.bold,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15
  },
  badgeTextCompact: {
    fontSize: 9,
    lineHeight: 12
  },
  category: {
    color: colors.ink,
    flexShrink: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
    minWidth: 0
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: EXPENSE_ROW_CARD_MIN_HEIGHT,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  contentCompact: {
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  date: {
    color: colors.muted,
    flexShrink: 0,
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18
  },
  dateSeparator: {
    color: colors.muted,
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18
  },
  textBlock: {
    flex: 1,
    gap: 5,
    justifyContent: 'center',
    minWidth: 0
  },
  leadingIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 42,
    justifyContent: 'center',
    width: 42
  },
  leadingIconCompact: {
    borderRadius: 17,
    height: 38,
    width: 38
  },
  subtitle: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17
  },
  subtitleCompact: {
    fontSize: 12,
    lineHeight: 16
  },
  time: {
    color: colors.muted,
    flexShrink: 0,
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    width: 42
  },
  timeCompact: {
    fontSize: 12,
    lineHeight: 16,
    width: 39
  },
  categoryCompact: {
    fontSize: 16,
    lineHeight: 21
  },
  titleRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 6,
    minWidth: 0
  }
});
