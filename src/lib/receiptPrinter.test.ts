import { describe, expect, it, vi } from 'vitest';

import {
  activeReceiptPrinterRun,
  buildReceiptPrinterModel,
  getReceiptPrinterStorageKey,
  shouldShowReceiptPrinter
} from './receiptPrinter';
import type { MonthlyReceiptStat, ReceiptCategoryLine } from './stats';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn()
  }
}));

describe('receipt printer gate', () => {
  it('does not show without a latest receipt', () => {
    expect(shouldShowReceiptPrinter({ latestReceipt: null, lastShownMonthKey: null })).toBe(false);
  });

  it('does not show for an empty latest receipt', () => {
    expect(shouldShowReceiptPrinter({
      lastShownMonthKey: null,
      latestReceipt: { monthKey: '2026-05', records: 0, totalYen: 0 }
    })).toBe(false);
  });

  it('does not show for a zero-spend latest receipt', () => {
    expect(shouldShowReceiptPrinter({
      lastShownMonthKey: null,
      latestReceipt: { monthKey: '2026-05', records: 2, totalYen: 0 }
    })).toBe(false);
  });

  it('shows when the latest receipt is newer than the persisted month', () => {
    expect(shouldShowReceiptPrinter({
      lastShownMonthKey: '2026-04',
      latestReceipt: { monthKey: '2026-05', records: 3, totalYen: 1000 }
    })).toBe(true);
  });

  it('does not show when the latest receipt has already been shown', () => {
    expect(shouldShowReceiptPrinter({
      lastShownMonthKey: '2026-05',
      latestReceipt: { monthKey: '2026-05', records: 3, totalYen: 1000 }
    })).toBe(false);
  });

  it('does not show when the persisted month is newer than the latest receipt', () => {
    expect(shouldShowReceiptPrinter({
      lastShownMonthKey: '2026-06',
      latestReceipt: { monthKey: '2026-05', records: 3, totalYen: 1000 }
    })).toBe(false);
  });

  it('scopes the storage key by ledger and user with the my-ledger prefix', () => {
    expect(getReceiptPrinterStorageKey('ledger-a', 'user-a')).toBe(
      'my-ledger.receiptPrinter.lastShown.ledger-a.user-a'
    );
    expect(getReceiptPrinterStorageKey('ledger-a', 'user-a')).not.toBe(
      getReceiptPrinterStorageKey('ledger-a', 'user-b')
    );
    expect(getReceiptPrinterStorageKey('ledger-a', 'user-a')).not.toBe(
      getReceiptPrinterStorageKey('ledger-b', 'user-a')
    );
  });
});

describe('receipt printer model', () => {
  it('builds continuous typed offsets', () => {
    const model = buildReceiptPrinterModel({
      currentUserName: 'Alex',
      otherUserName: 'Mina',
      receipt: receiptFixture()
    });

    let offset = 0;
    for (const run of model.runs) {
      expect(run.offset).toBe(offset);
      offset += run.length;
    }
    expect(model.totalChars).toBe(offset);
    expect(model.stream).toBe(model.runs.map((run) => run.text).join(''));
  });

  it('includes the receipt content needed by the printer', () => {
    const model = buildReceiptPrinterModel({
      currentUserName: 'Alex',
      otherUserName: 'Mina',
      receipt: receiptFixture()
    });

    expect(model.stream).toContain('MAY 2026');
    expect(model.stream).toContain('Food & Dining');
    expect(model.stream).toContain('daily avg ￥323');
    expect(model.stream).toContain('SPLIT ADJUSTED');
    expect(model.stream).toContain('ALEX');
    expect(model.stream).not.toContain('ALEX · 60%');
    expect(model.stream).not.toContain('active');
    expect(model.stream).toContain('TOTAL');
    expect(model.stream).toContain('↑ 20.0% over');
    expect(model.stream).not.toContain('#2026-05 · SETTLED');
    expect(model.nodes.some((node) => node.type === 'barcode')).toBe(true);
  });

  it('resolves at most one active caret run for every typed position', () => {
    const model = buildReceiptPrinterModel({
      currentUserName: 'Alex',
      otherUserName: 'Mina',
      receipt: receiptFixture()
    });

    for (let typed = 0; typed <= model.totalChars; typed += 1) {
      const activeRun = activeReceiptPrinterRun(model, typed);
      const matchingRuns = model.runs.filter((run) => typed >= run.offset && typed < run.offset + run.length);
      expect(matchingRuns).toHaveLength(activeRun ? 1 : 0);
      expect(activeRun?.id || null).toBe(matchingRuns[0]?.id || null);
    }
  });
});

function receiptFixture(): MonthlyReceiptStat {
  return {
    activeCategoryCount: 1,
    alexAmountYen: 6000,
    alexPercentage: 60,
    categoryAmounts: {
      communications: 0,
      entertainment: 0,
      food_dining: 10000,
      healthcare: 0,
      household: 0,
      housing: 0,
      other: 0,
      shopping: 0,
      transport: 0,
      travel: 0,
      utilities: 0
    },
    code: '2026-05',
    comparison: {
      direction: 'over',
      label: 'Apr',
      percentage: 20,
      previousTotalYen: 8000
    },
    dailyAverageYen: 323,
    days: 31,
    label: 'MAY 2026',
    lines: [
      lineFixture({
        amountYen: 10000,
        categoryId: 'food_dining',
        color: '#CB5F43',
        label: 'Food & Dining',
        momDirection: 'up',
        momLabel: '+25%',
        previousAmountYen: 8000
      }),
      lineFixture({
        amountYen: 0,
        categoryId: 'transport',
        color: '#4F77BE',
        label: 'Transport',
        momDirection: 'flat',
        momLabel: '—',
        previousAmountYen: 0
      })
    ],
    minaAmountYen: 4000,
    minaPercentage: 40,
    monthKey: '2026-05',
    previousMonthKey: '2026-04',
    records: 4,
    span: 'May 1-31',
    totalYen: 10000
  };
}

function lineFixture(line: ReceiptCategoryLine): ReceiptCategoryLine {
  return line;
}
