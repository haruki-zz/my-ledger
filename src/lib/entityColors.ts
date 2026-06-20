import { CHART_PALETTE } from './chartPalette';
import { categoryColor, isPrimaryCategoryId, mapLegacyCategoryToId, PRIMARY_CATEGORIES } from './categorySystem';

export const DEFAULT_USER_COLOR = '#B25A3C';
export const OTHER_CATEGORY_COLOR = '#9A8F84';
export const DEFAULT_USER_COLOR_ON_DARK = '#E0967A';
export const DEFAULT_PARTNER_COLOR_ON_DARK = '#6FB8B2';

const USER_FALLBACK_PALETTE = [
  '#3F8A86',
  '#7C4A66',
  '#4338CA',
  '#A16207',
  '#7F1D1D',
  '#581C87'
] as const;
export const DEFAULT_PARTNER_COLOR = USER_FALLBACK_PALETTE[0];

const defaultCategoryColorByKey = new Map(
  PRIMARY_CATEGORIES.map((category) => [
    normalizeEntityKey(category.label),
    category.color
  ])
);

export function colorForCategory(category: string) {
  if (isPrimaryCategoryId(category)) {
    return categoryColor(category);
  }

  const normalizedCategory = normalizeEntityKey(category);
  if (!normalizedCategory) {
    return OTHER_CATEGORY_COLOR;
  }

  const legacyCategoryId = mapLegacyCategoryToId(category);
  if (legacyCategoryId !== 'other' || normalizedCategory === 'other' || normalizedCategory === '其他') {
    return categoryColor(legacyCategoryId);
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

export function colorForDarkSurface(color: string) {
  const normalized = color.toUpperCase();
  if (normalized === DEFAULT_USER_COLOR) {
    return DEFAULT_USER_COLOR_ON_DARK;
  }

  if (normalized === DEFAULT_PARTNER_COLOR) {
    return DEFAULT_PARTNER_COLOR_ON_DARK;
  }

  return lightenHexColor(color, 0.34);
}

function normalizeEntityKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function lightenHexColor(color: string, amount: number) {
  const hex = color.replace('#', '');
  if (!/^[0-9A-F]{6}$/i.test(hex)) {
    return color;
  }

  const value = Number.parseInt(hex, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `#${[red, green, blue].map((channel) => {
    const next = Math.round(channel + (255 - channel) * amount);
    return next.toString(16).padStart(2, '0');
  }).join('')}`.toUpperCase();
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
