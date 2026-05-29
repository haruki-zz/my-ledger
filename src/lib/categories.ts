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
