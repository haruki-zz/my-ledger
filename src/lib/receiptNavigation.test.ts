import { describe, expect, it } from 'vitest';

import {
  buildReceiptYearGroups,
  nextReceiptIndexWithinYear,
  receiptYear,
  type ReceiptNavigationItem
} from './receiptNavigation';

describe('receipt navigation', () => {
  const receipts = receiptItems([
    '2026-05',
    '2026-04',
    '2026-03',
    '2026-02',
    '2026-01',
    '2025-12',
    '2025-11',
    '2025-10'
  ]);

  it('builds newest-first year groups', () => {
    const groups = buildReceiptYearGroups(receipts);

    expect(groups.map((group) => group.year)).toEqual([2026, 2025]);
  });

  it('selects the latest closed month when jumping to a year', () => {
    const groups = buildReceiptYearGroups(receipts);

    expect(receipts[groups[0].latestReceiptIndex].monthKey).toBe('2026-05');
    expect(receipts[groups[1].latestReceiptIndex].monthKey).toBe('2025-12');
  });

  it('advances and rewinds inside the selected year', () => {
    const groups = buildReceiptYearGroups(receipts);

    expect(receipts[nextReceiptIndexWithinYear(groups, 3, 1)].monthKey).toBe('2026-03');
    expect(receipts[nextReceiptIndexWithinYear(groups, 3, -1)].monthKey).toBe('2026-01');
  });

  it('loops inside a partial year without crossing years', () => {
    const groups = buildReceiptYearGroups(receipts);

    expect(receipts[nextReceiptIndexWithinYear(groups, 0, 1)].monthKey).toBe('2026-01');
    expect(receipts[nextReceiptIndexWithinYear(groups, 4, -1)].monthKey).toBe('2026-05');
  });

  it('keeps single-month years as a no-op', () => {
    const singleMonthReceipts = receiptItems(['2026-01', '2025-12', '2024-11', '2024-10']);
    const groups = buildReceiptYearGroups(singleMonthReceipts);

    expect(nextReceiptIndexWithinYear(groups, 0, 1)).toBe(0);
    expect(nextReceiptIndexWithinYear(groups, 1, -1)).toBe(1);
  });

  it('derives the year from a month key', () => {
    expect(receiptYear('2026-05')).toBe(2026);
  });
});

function receiptItems(monthKeys: string[]): ReceiptNavigationItem[] {
  return monthKeys.map((monthKey) => ({ monthKey }));
}
