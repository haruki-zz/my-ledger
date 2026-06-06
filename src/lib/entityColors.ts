import { EXPENSE_CATEGORIES } from './categories';
import { CHART_PALETTE } from './chartPalette';

export const DEFAULT_USER_COLOR = '#0F766E';
export const OTHER_CATEGORY_COLOR = '#98A2B3';

const USER_FALLBACK_PALETTE = [
  '#F97316',
  '#6366F1',
  '#14B8A6',
  '#F59E0B',
  '#8B5CF6',
  '#22C55E',
  '#2563EB',
  '#D946EF',
  '#06B6D4',
  '#84CC16',
  '#E11D48',
  '#64748B'
] as const;

const defaultCategoryColorByKey = new Map(
  EXPENSE_CATEGORIES.map((category, index) => [
    normalizeEntityKey(category),
    category === 'Other'
      ? OTHER_CATEGORY_COLOR
      : CHART_PALETTE[index % CHART_PALETTE.length]
  ])
);

export function colorForCategory(category: string) {
  const normalizedCategory = normalizeEntityKey(category);
  if (!normalizedCategory) {
    return OTHER_CATEGORY_COLOR;
  }

  const defaultColor = defaultCategoryColorByKey.get(normalizedCategory);
  if (defaultColor) {
    return defaultColor;
  }

  return CHART_PALETTE[hashString(normalizedCategory) % CHART_PALETTE.length] || DEFAULT_USER_COLOR;
}

export function buildUserColorMap(userIds: string[], currentUserId: string | null | undefined) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  const colorsById = new Map<string, string>();
  let fallbackColorIndex = 0;

  for (const userId of uniqueUserIds) {
    if (currentUserId && userId === currentUserId) {
      colorsById.set(userId, DEFAULT_USER_COLOR);
      continue;
    }

    colorsById.set(userId, USER_FALLBACK_PALETTE[fallbackColorIndex % USER_FALLBACK_PALETTE.length]);
    fallbackColorIndex += 1;
  }

  return colorsById;
}

export function colorForUserId(
  userId: string | null | undefined,
  currentUserId: string | null | undefined,
  orderedUserIds: string[]
) {
  if (!userId) {
    return DEFAULT_USER_COLOR;
  }

  return buildUserColorMap(orderedUserIds, currentUserId).get(userId) || DEFAULT_USER_COLOR;
}

function normalizeEntityKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
