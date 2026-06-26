import { describe, expect, it } from 'vitest';

import {
  buildWeekStrip,
  calculateSplitAmounts,
  complementShareAmounts,
  dateSummary,
  deriveSplitBackfill,
  updateKeypadBuffer,
  wrapIndex
} from './expenseFormHelpers';

describe('expense form helpers', () => {
  it('updates keypad buffers with delete, double-zero, leading-zero stripping, and digit limit', () => {
    expect(updateKeypadBuffer('', '00')).toBe('');
    expect(updateKeypadBuffer('', '0')).toBe('0');
    expect(updateKeypadBuffer('0', '5')).toBe('5');
    expect(updateKeypadBuffer('123', 'del')).toBe('12');
    expect(updateKeypadBuffer('123456789', '9')).toBe('123456789');
  });

  it('builds week strips across month and year boundaries and marks future days', () => {
    const strip = buildWeekStrip({
      selectedDateString: '2027-01-01',
      todayDateString: '2027-01-02',
      weekOffset: 0
    });

    expect(strip.weekLabel).toBe('DEC 27');
    expect(strip.days.map((day) => day.dateString)).toEqual([
      '2026-12-27',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02'
    ]);
    expect(strip.days.find((day) => day.dateString === '2027-01-01')?.isSelected).toBe(true);
    expect(strip.days.some((day) => day.isFuture)).toBe(false);

    const currentWeek = buildWeekStrip({
      selectedDateString: '2027-01-02',
      todayDateString: '2027-01-01',
      weekOffset: 0
    });
    expect(currentWeek.days.find((day) => day.dateString === '2027-01-02')?.isFuture).toBe(true);
  });

  it('summarizes today, yesterday, and older dates', () => {
    expect(dateSummary('2026-06-26', '2026-06-26')).toBe('Today');
    expect(dateSummary('2026-06-25', '2026-06-26')).toBe('Yesterday');
    expect(dateSummary('2026-06-22', '2026-06-26')).toBe('Mon 22');
  });

  it('wraps category indexes in both directions', () => {
    expect(wrapIndex(-1, 11)).toBe(10);
    expect(wrapIndex(11, 11)).toBe(0);
    expect(wrapIndex(14, 11)).toBe(3);
  });

  it('calculates split amounts that add up to total', () => {
    expect(calculateSplitAmounts(999, 33.3)).toEqual([333, 666]);
    expect(calculateSplitAmounts(1000, -10)).toEqual([0, 1000]);
    expect(calculateSplitAmounts(1000, 120)).toEqual([1000, 0]);
  });

  it('backfills shared splits and derives exact ratio percentage', () => {
    const backfill = deriveSplitBackfill({
      memberIds: ['alex', 'mina'],
      ownership: 'shared',
      splits: [
        { user_id: 'alex', amount_yen: 333 },
        { user_id: 'mina', amount_yen: 667 }
      ],
      totalAmount: 1000
    });

    expect(backfill.amountByUserId).toEqual({ alex: 333, mina: 667 });
    expect(backfill.splitPct).toBe(33.300000000000004);
  });

  it('backfills personal expenses to paidBy as 100 percent', () => {
    expect(deriveSplitBackfill({
      memberIds: ['alex', 'mina'],
      ownership: 'personal',
      paidBy: 'mina',
      totalAmount: 1200
    })).toEqual({
      amountByUserId: { alex: 0, mina: 1200 },
      splitPct: 0
    });
  });

  it('clamps manually keyed shares and complements the other member', () => {
    expect(complementShareAmounts({
      memberIds: ['alex', 'mina'],
      totalAmount: 900,
      userId: 'alex',
      value: '1200'
    })).toEqual({ alex: 900, mina: 0 });

    expect(complementShareAmounts({
      memberIds: ['alex', 'mina'],
      totalAmount: 900,
      userId: 'mina',
      value: '350'
    })).toEqual({ alex: 550, mina: 350 });
  });
});
