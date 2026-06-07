import type { RecurringExpenseRule } from '@/src/types/database';

export type RecurringSubcategoryKey = `${string}::${string}`;

export function monthKeyToStartDate(monthKey: string) {
  if (!isValidMonthKey(monthKey)) {
    throw new Error('Month must use YYYY-MM format');
  }

  return `${monthKey}-01`;
}

export function dateStringToMonthKey(dateString: string) {
  return dateString.slice(0, 7);
}

export function currentMonthStartDate() {
  const now = new Date();
  return monthKeyToStartDate([
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0')
  ].join('-'));
}

export function isValidMonthKey(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month] = value.split('-').map(Number);
  return month >= 1 && month <= 12 && year >= 1900 && year <= 9999;
}

export function clampGenerateDayForMonth(monthKey: string, generateDay: number) {
  if (!isValidMonthKey(monthKey)) {
    throw new Error('Month must use YYYY-MM format');
  }

  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return Math.min(Math.max(1, Math.trunc(generateDay)), lastDay);
}

export function generatedSpentOnDate(monthKey: string, generateDay: number) {
  return `${monthKey}-${String(clampGenerateDayForMonth(monthKey, generateDay)).padStart(2, '0')}`;
}

export function normalizeRecurringSubcategory(value: string | null | undefined) {
  return value?.trim().toLowerCase() || '';
}

export function recurringRuleSubcategoryKey(categoryId: string, subcategory: string | null | undefined): RecurringSubcategoryKey {
  return `${categoryId}::${normalizeRecurringSubcategory(subcategory)}`;
}

export function activeRecurringSubcategoryKeys(
  rules: Pick<RecurringExpenseRule, 'category_id' | 'subcategory' | 'is_active'>[]
) {
  return new Set(
    rules
      .filter((rule) => rule.is_active && normalizeRecurringSubcategory(rule.subcategory))
      .map((rule) => recurringRuleSubcategoryKey(rule.category_id, rule.subcategory))
  );
}
