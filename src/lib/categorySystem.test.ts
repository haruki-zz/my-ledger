import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NEW_EXPENSE_CATEGORY_ID,
  DEFAULT_NEW_EXPENSE_SUBCATEGORY,
  categoryLabel,
  subcategoryPresets
} from './categorySystem';

describe('category system defaults', () => {
  it('defaults new expenses to food and groceries', () => {
    expect(DEFAULT_NEW_EXPENSE_CATEGORY_ID).toBe('food_dining');
    expect(categoryLabel(DEFAULT_NEW_EXPENSE_CATEGORY_ID)).toBe('Food & Dining');
    expect(DEFAULT_NEW_EXPENSE_SUBCATEGORY).toBe('Groceries');
    expect(subcategoryPresets(DEFAULT_NEW_EXPENSE_CATEGORY_ID)).toContain(DEFAULT_NEW_EXPENSE_SUBCATEGORY);
  });
});
