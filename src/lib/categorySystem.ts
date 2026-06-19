import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

export const PRIMARY_CATEGORIES = [
  {
    id: 'food_dining',
    label: 'Food & Dining',
    icon: 'restaurant-outline',
    color: '#CB5F43',
    splitRatio: [50, 50],
    sortOrder: 10,
    subcategories: ['Groceries', 'Restaurant', 'Cafe', 'Delivery', 'Drinks']
  },
  {
    id: 'household',
    label: 'Household',
    icon: 'basket-outline',
    color: '#8AA248',
    splitRatio: [50, 50],
    sortOrder: 20,
    subcategories: ['Daily Goods', 'Cleaning', 'Furniture', 'Kitchen', 'Laundry']
  },
  {
    id: 'transport',
    label: 'Transport',
    icon: 'bus-outline',
    color: '#4F77BE',
    splitRatio: [50, 50],
    sortOrder: 30,
    subcategories: ['Train', 'Taxi', 'Bus', 'Parking', 'Fuel']
  },
  {
    id: 'housing',
    label: 'Housing',
    icon: 'home-outline',
    color: '#8A6FB6',
    splitRatio: [50, 50],
    sortOrder: 40,
    subcategories: ['Rent', 'Mortgage', 'Building Fee', 'Repair', 'Moving']
  },
  {
    id: 'utilities',
    label: 'Utilities',
    icon: 'flash-outline',
    color: '#D2A032',
    splitRatio: [50, 50],
    sortOrder: 50,
    subcategories: ['Electricity', 'Gas', 'Water', 'Heating']
  },
  {
    id: 'communications',
    label: 'Communications',
    icon: 'chatbubbles-outline',
    color: '#4E97B5',
    splitRatio: [50, 50],
    sortOrder: 60,
    subcategories: ['Mobile', 'Internet', 'Phone', 'Postage']
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    icon: 'medkit-outline',
    color: '#4FA670',
    splitRatio: [50, 50],
    sortOrder: 70,
    subcategories: ['Doctor', 'Pharmacy', 'Dental', 'Wellness']
  },
  {
    id: 'entertainment',
    label: 'Entertainment',
    icon: 'film-outline',
    color: '#A85DA8',
    splitRatio: [50, 50],
    sortOrder: 80,
    subcategories: ['Movies & Shows', 'Dating', 'Games', 'Music', 'Subscription', 'Hobby', 'Sports']
  },
  {
    id: 'shopping',
    label: 'Shopping',
    icon: 'bag-outline',
    color: '#C9628F',
    splitRatio: [50, 50],
    sortOrder: 90,
    subcategories: ['Clothes', 'Electronics', 'Gifts', 'Beauty & Salon', 'Books']
  },
  {
    id: 'travel',
    label: 'Travel',
    icon: 'airplane-outline',
    color: '#3FA29A',
    splitRatio: [50, 50],
    sortOrder: 100,
    subcategories: ['Hotel', 'Flight', 'Local Transport', 'Activities', 'Souvenirs']
  },
  {
    id: 'other',
    label: 'Other',
    icon: 'ellipsis-horizontal',
    color: '#9A8F84',
    splitRatio: [50, 50],
    sortOrder: 110,
    subcategories: ['Insurance', 'Fees', 'Gift', 'Misc']
  }
] as const;

export type PrimaryCategory = (typeof PRIMARY_CATEGORIES)[number];
export type PrimaryCategoryId = PrimaryCategory['id'];
export type CategoryIconName = ComponentProps<typeof Ionicons>['name'];

const DEFAULT_CATEGORY_ID: PrimaryCategoryId = 'other';
export const DEFAULT_CATEGORY_SPLIT_RATIO = [50, 50] as const;

const CATEGORY_BY_ID = new Map<PrimaryCategoryId, PrimaryCategory>(
  PRIMARY_CATEGORIES.map((category) => [category.id, category])
);
const CATEGORY_ID_SET = new Set<string>(PRIMARY_CATEGORIES.map((category) => category.id));
const CATEGORY_BY_LABEL = new Map(
  PRIMARY_CATEGORIES.map((category) => [normalizeCategoryKey(category.label), category])
);
const LEGACY_CATEGORY_ALIASES = new Map<string, PrimaryCategoryId>([
  ['food', 'food_dining'],
  ['rent', 'housing'],
  ['房租', 'housing'],
  ['food & dining', 'food_dining'],
  ['餐饮', 'food_dining'],
  ['household', 'household'],
  ['日用品', 'household'],
  ['transport', 'transport'],
  ['交通', 'transport'],
  ['utilities', 'utilities'],
  ['水电燃气', 'utilities'],
  ['communications', 'communications'],
  ['通信', 'communications'],
  ['healthcare', 'healthcare'],
  ['医疗', 'healthcare'],
  ['entertainment', 'entertainment'],
  ['娱乐', 'entertainment'],
  ['shopping', 'shopping'],
  ['购物', 'shopping'],
  ['travel', 'travel'],
  ['旅行', 'travel'],
  ['other', 'other'],
  ['其他', 'other']
]);

export type ResolvedCategory = {
  category: PrimaryCategory;
  categoryId: PrimaryCategoryId;
  label: string;
  legacyCategory: string | null;
  subcategory: string | null;
};

export function isPrimaryCategoryId(value: string | null | undefined): value is PrimaryCategoryId {
  return Boolean(value && CATEGORY_ID_SET.has(value));
}

export function getPrimaryCategory(categoryId: string | null | undefined): PrimaryCategory {
  if (isPrimaryCategoryId(categoryId)) {
    return CATEGORY_BY_ID.get(categoryId) || CATEGORY_BY_ID.get(DEFAULT_CATEGORY_ID)!;
  }

  return CATEGORY_BY_ID.get(DEFAULT_CATEGORY_ID)!;
}

export function categoryLabel(categoryId: string | null | undefined) {
  return getPrimaryCategory(categoryId).label;
}

export function categoryIconName(categoryId: string | null | undefined): CategoryIconName {
  return getPrimaryCategory(categoryId).icon;
}

export function categoryColor(categoryId: string | null | undefined) {
  return getPrimaryCategory(categoryId).color;
}

export function subcategoryPresets(categoryId: string | null | undefined) {
  return [...getPrimaryCategory(categoryId).subcategories];
}

export function resolveCategory(input: {
  categoryId?: string | null;
  category?: string | null;
  subcategory?: string | null;
}): ResolvedCategory {
  const normalizedSubcategory = normalizeOptionalText(input.subcategory);
  if (isPrimaryCategoryId(input.categoryId)) {
    const category = getPrimaryCategory(input.categoryId);
    return {
      category,
      categoryId: category.id,
      label: category.label,
      legacyCategory: normalizeOptionalText(input.category),
      subcategory: normalizedSubcategory
    };
  }

  const legacyCategory = normalizeOptionalText(input.category);
  const mappedCategoryId = mapLegacyCategoryToId(legacyCategory);
  const category = getPrimaryCategory(mappedCategoryId);
  const shouldPreserveLegacyAsSubcategory = Boolean(
    legacyCategory &&
    legacyCategory !== category.label &&
    shouldPreserveLegacyCategoryText(legacyCategory)
  );

  return {
    category,
    categoryId: category.id,
    label: category.label,
    legacyCategory,
    subcategory: normalizedSubcategory || (shouldPreserveLegacyAsSubcategory ? legacyCategory : null)
  };
}

export function mapLegacyCategoryToId(category: string | null | undefined): PrimaryCategoryId {
  const normalized = normalizeCategoryKey(category || '');
  if (!normalized) {
    return DEFAULT_CATEGORY_ID;
  }

  const alias = LEGACY_CATEGORY_ALIASES.get(normalized);
  if (alias) {
    return alias;
  }

  const labelMatch = CATEGORY_BY_LABEL.get(normalized);
  if (labelMatch) {
    return labelMatch.id;
  }

  return DEFAULT_CATEGORY_ID;
}

export function categoryWithSubcategory(input: {
  categoryId?: string | null;
  category?: string | null;
  subcategory?: string | null;
}) {
  const resolved = resolveCategory(input);
  return resolved.subcategory ? `${resolved.label} · ${resolved.subcategory}` : resolved.label;
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim() || '';
  return trimmed || null;
}

function shouldPreserveLegacyCategoryText(value: string) {
  const normalized = normalizeCategoryKey(value);
  if (normalized === 'rent' || normalized === '房租') {
    return true;
  }

  return !CATEGORY_BY_LABEL.has(normalized) && !LEGACY_CATEGORY_ALIASES.has(normalized);
}

function normalizeCategoryKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
