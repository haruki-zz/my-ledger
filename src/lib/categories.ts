// Stored category names remain free-form database values; this list seeds new ledgers and picker fallbacks only.
export const EXPENSE_CATEGORIES = [
  'Food & Dining',
  'Household',
  'Transport',
  'Rent',
  'Utilities',
  'Communications',
  'Healthcare',
  'Entertainment',
  'Shopping',
  'Travel',
  'Other'
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const DEFAULT_EXPENSE_CATEGORY_SPLIT_RATIO = [50, 50] as const;

export const EXPENSE_CATEGORY_SPLIT_RATIOS: Record<ExpenseCategory, readonly [number, number]> = {
  'Food & Dining': [50, 50],
  Household: [50, 50],
  Transport: [50, 50],
  Rent: [50, 50],
  Utilities: [50, 50],
  Communications: [50, 50],
  Healthcare: [50, 50],
  Entertainment: [50, 50],
  Shopping: [50, 50],
  Travel: [50, 50],
  Other: [50, 50]
};

export function getDefaultCategories() {
  return EXPENSE_CATEGORIES.map((categoryName, index) => ({
    categoryName,
    splitRatioA: EXPENSE_CATEGORY_SPLIT_RATIOS[categoryName][0],
    splitRatioB: EXPENSE_CATEGORY_SPLIT_RATIOS[categoryName][1],
    sortOrder: (index + 1) * 10
  }));
}

export function getExpenseCategorySplitRatio(category: string): readonly [number, number] {
  if ((EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
    return EXPENSE_CATEGORY_SPLIT_RATIOS[category as ExpenseCategory];
  }

  return DEFAULT_EXPENSE_CATEGORY_SPLIT_RATIO;
}

export function iconNameForExpenseCategory(category: string) {
  const cachedIcon = categoryIconCache.get(category);
  if (cachedIcon) {
    return cachedIcon;
  }

  const icon = resolveExpenseCategoryIcon(category);
  categoryIconCache.set(category, icon);
  return icon;
}

type ExpenseCategoryIconName = ReturnType<typeof resolveExpenseCategoryIcon>;

const categoryIconCache = new Map<string, ExpenseCategoryIconName>();

function resolveExpenseCategoryIcon(category: string) {
  const normalized = category.toLowerCase();

  if (normalized.includes('housing') || normalized.includes('house') || normalized.includes('rent')) {
    return 'home-outline' as const;
  }

  if (
    normalized.includes('food') ||
    normalized.includes('dining') ||
    normalized.includes('grocery') ||
    normalized.includes('groceries') ||
    normalized.includes('meal') ||
    normalized.includes('restaurant') ||
    normalized.includes('coffee') ||
    normalized.includes('cafe')
  ) {
    return 'restaurant-outline' as const;
  }

  if (
    normalized.includes('transport') ||
    normalized.includes('train') ||
    normalized.includes('taxi') ||
    normalized.includes('commute') ||
    normalized.includes('bus') ||
    normalized.includes('parking') ||
    normalized.includes('fuel')
  ) {
    return 'bus-outline' as const;
  }

  if (
    normalized.includes('utilities') ||
    normalized.includes('electric') ||
    normalized.includes('power') ||
    normalized.includes('gas') ||
    normalized.includes('water')
  ) {
    return 'flash-outline' as const;
  }

  if (
    normalized.includes('communication') ||
    normalized.includes('phone') ||
    normalized.includes('mobile') ||
    normalized.includes('internet') ||
    normalized.includes('wifi')
  ) {
    return 'chatbubbles-outline' as const;
  }

  if (normalized.includes('health') || normalized.includes('medical') || normalized.includes('doctor') || normalized.includes('pharmacy')) {
    return 'medkit-outline' as const;
  }

  if (
    normalized.includes('entertainment') ||
    normalized.includes('movie') ||
    normalized.includes('music') ||
    normalized.includes('game') ||
    normalized.includes('subscription')
  ) {
    return 'film-outline' as const;
  }

  if (
    normalized.includes('shopping') ||
    normalized.includes('store') ||
    normalized.includes('clothes') ||
    normalized.includes('clothing')
  ) {
    return 'bag-outline' as const;
  }

  if (normalized.includes('travel') || normalized.includes('hotel') || normalized.includes('flight')) {
    return 'airplane-outline' as const;
  }

  return 'ellipsis-horizontal' as const;
}
