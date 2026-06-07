import { describe, expect, it } from 'vitest';

import {
  activeRecurringSubcategoryKeys,
  generatedSpentOnDate,
  isValidMonthKey,
  monthKeyToStartDate,
  recurringRuleSubcategoryKey
} from './recurring';

describe('recurring helpers', () => {
  it('clamps generate_day to the last day of a month', () => {
    expect(generatedSpentOnDate('2026-02', 31)).toBe('2026-02-28');
    expect(generatedSpentOnDate('2024-02', 31)).toBe('2024-02-29');
    expect(generatedSpentOnDate('2026-04', 30)).toBe('2026-04-30');
  });

  it('validates month keys and converts them to month-start dates', () => {
    expect(isValidMonthKey('2026-06')).toBe(true);
    expect(isValidMonthKey('2026-13')).toBe(false);
    expect(monthKeyToStartDate('2026-06')).toBe('2026-06-01');
    expect(() => monthKeyToStartDate('2026-6')).toThrow('YYYY-MM');
  });

  it('builds active recurring subcategory keys case-insensitively', () => {
    const keys = activeRecurringSubcategoryKeys([
      { category_id: 'housing', subcategory: 'Rent', is_active: true },
      { category_id: 'communications', subcategory: 'Internet', is_active: false },
      { category_id: 'utilities', subcategory: null, is_active: true }
    ]);

    expect(keys.has(recurringRuleSubcategoryKey('housing', 'rent'))).toBe(true);
    expect(keys.has(recurringRuleSubcategoryKey('communications', 'Internet'))).toBe(false);
    expect(keys.has(recurringRuleSubcategoryKey('utilities', null))).toBe(false);
  });
});
