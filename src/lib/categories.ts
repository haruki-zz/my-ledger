import {
  PRIMARY_CATEGORIES,
  categoryIconName,
  categorySplitRatio,
  getDefaultCategorySettings,
  mapLegacyCategoryToId,
  resolveCategory
} from './categorySystem';

// Compatibility exports for older call sites. New code should use categorySystem.ts.
export const EXPENSE_CATEGORIES = PRIMARY_CATEGORIES.map((category) => category.label);

export type ExpenseCategory = string;

export const DEFAULT_EXPENSE_CATEGORY_SPLIT_RATIO = [50, 50] as const;
export const EXPENSE_CATEGORY_SPLIT_RATIOS = Object.fromEntries(
  PRIMARY_CATEGORIES.map((category) => [category.label, category.splitRatio])
) as Record<string, readonly [number, number]>;

export function getDefaultCategories() {
  return getDefaultCategorySettings();
}

export function getExpenseCategorySplitRatio(category: string): readonly [number, number] {
  return categorySplitRatio(mapLegacyCategoryToId(category));
}

export function iconNameForExpenseCategory(category: string) {
  return categoryIconName(resolveCategory({ category }).categoryId);
}
