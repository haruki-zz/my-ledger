import {
  PRIMARY_CATEGORIES,
  categoryIconName,
  resolveCategory
} from './categorySystem';

export const EXPENSE_CATEGORIES = PRIMARY_CATEGORIES.map((category) => category.label);

export function iconNameForExpenseCategory(category: string) {
  return categoryIconName(resolveCategory({ category }).categoryId);
}
