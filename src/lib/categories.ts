export const EXPENSE_CATEGORIES = [
  '餐饮',
  '日用品',
  '交通',
  '房租',
  '水电燃气',
  '通信',
  '医疗',
  '娱乐',
  '购物',
  '旅行',
  '其他'
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const DEFAULT_EXPENSE_CATEGORY_SPLIT_RATIO = [50, 50] as const;

export const EXPENSE_CATEGORY_SPLIT_RATIOS: Record<ExpenseCategory, readonly [number, number]> = {
  餐饮: [50, 50],
  日用品: [50, 50],
  交通: [50, 50],
  房租: [50, 50],
  水电燃气: [50, 50],
  通信: [50, 50],
  医疗: [50, 50],
  娱乐: [50, 50],
  购物: [50, 50],
  旅行: [50, 50],
  其他: [50, 50]
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
