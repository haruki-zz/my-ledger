import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/src/components/styles';

type SpendComparisonDirection = 'new' | 'over' | 'same' | 'under';
type IoniconName = keyof typeof Ionicons.glyphMap;

type SpendComparisonOptions = {
  neutralIcon?: IoniconName;
  tone?: 'default' | 'onDark';
};

export type SpendComparisonPresentation = {
  color: string;
  icon: IoniconName;
  symbol: string;
  word: string;
};

export function getSpendComparisonPresentation(
  direction: SpendComparisonDirection,
  options: SpendComparisonOptions = {}
): SpendComparisonPresentation {
  const neutralIcon = options.neutralIcon || 'remove';
  const successColor = options.tone === 'onDark' ? colors.successOnDark : colors.success;
  const dangerColor = options.tone === 'onDark' ? colors.dangerOnDark : colors.danger;
  const neutralColor = options.tone === 'onDark' ? 'rgba(255,255,255,0.78)' : colors.muted;

  if (direction === 'under') {
    return {
      color: successColor,
      icon: 'trending-down-outline',
      symbol: '↓',
      word: 'under'
    };
  }

  if (direction === 'over') {
    return {
      color: dangerColor,
      icon: 'trending-up-outline',
      symbol: '↑',
      word: 'over'
    };
  }

  if (direction === 'new') {
    return {
      color: options.tone === 'onDark' ? '#F4CF7A' : colors.secondary,
      icon: 'sparkles-outline',
      symbol: '+',
      word: 'new'
    };
  }

  return {
    color: neutralColor,
    icon: neutralIcon,
    symbol: '-',
    word: 'flat'
  };
}
