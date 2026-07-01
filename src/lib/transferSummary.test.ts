import { describe, expect, it } from 'vitest';

import { buildNetSummary, filterOccurredTransferItems, shouldHideSettledTransferEntry } from './transferSummary';
import type { LedgerMemberProfile, TransferChecklistItemRow } from '@/src/types/database';

const ALEX_ID = 'alex-user-id';
const MINA_ID = 'mina-user-id';

const members = [
  member(ALEX_ID, 'Alex'),
  member(MINA_ID, 'Mina')
];

describe('buildNetSummary', () => {
  it('summarizes one-way Mina to Alex debt', () => {
    const summary = buildNetSummary([
      transferItem({ amountYen: 6800, payerUserId: MINA_ID, payeeUserId: ALEX_ID }),
      transferItem({ amountYen: 4200, payerUserId: MINA_ID, payeeUserId: ALEX_ID })
    ], members);

    expect(summary).toEqual({
      amountYen: 11000,
      count: 2,
      payerUserId: MINA_ID,
      payeeUserId: ALEX_ID
    });
  });

  it('nets transfer items in both directions', () => {
    const summary = buildNetSummary([
      transferItem({ amountYen: 6800, payerUserId: MINA_ID, payeeUserId: ALEX_ID }),
      transferItem({ amountYen: 2200, payerUserId: ALEX_ID, payeeUserId: MINA_ID })
    ], members);

    expect(summary).toEqual({
      amountYen: 4600,
      count: 2,
      payerUserId: MINA_ID,
      payeeUserId: ALEX_ID
    });
  });

  it('returns an empty net when directions fully cancel', () => {
    const summary = buildNetSummary([
      transferItem({ amountYen: 4200, payerUserId: MINA_ID, payeeUserId: ALEX_ID }),
      transferItem({ amountYen: 4200, payerUserId: ALEX_ID, payeeUserId: MINA_ID })
    ], members);

    expect(summary).toEqual({
      amountYen: 0,
      count: 0,
      payerUserId: null,
      payeeUserId: null
    });
  });
});

describe('filterOccurredTransferItems', () => {
  it('keeps only transfer items whose expense date has occurred', () => {
    const occurredItem = transferItem({
      amountYen: 6800,
      payerUserId: MINA_ID,
      payeeUserId: ALEX_ID,
      spentOn: '2026-06-30'
    });
    const todayItem = transferItem({
      amountYen: 4200,
      payerUserId: MINA_ID,
      payeeUserId: ALEX_ID,
      spentOn: '2026-07-01'
    });
    const futureFixedExpenseItem = transferItem({
      amountYen: 120000,
      payerUserId: MINA_ID,
      payeeUserId: ALEX_ID,
      spentOn: '2026-07-25'
    });
    const futureRegularExpenseItem = transferItem({
      amountYen: 1500,
      payerUserId: ALEX_ID,
      payeeUserId: MINA_ID,
      spentOn: '2026-07-02'
    });

    expect(filterOccurredTransferItems([
      occurredItem,
      todayItem,
      futureFixedExpenseItem,
      futureRegularExpenseItem
    ], '2026-07-01')).toEqual([
      occurredItem,
      todayItem
    ]);
  });
});

describe('shouldHideSettledTransferEntry', () => {
  it('hides only after settled transfer state is idle and error-free', () => {
    expect(shouldHideSettledTransferEntry({
      error: null,
      loading: false,
      openCount: 0,
      saving: false,
      sheetActive: false
    })).toBe(true);

    expect(shouldHideSettledTransferEntry({
      error: null,
      loading: false,
      openCount: 1,
      saving: false,
      sheetActive: false
    })).toBe(false);
    expect(shouldHideSettledTransferEntry({
      error: null,
      loading: true,
      openCount: 0,
      saving: false,
      sheetActive: false
    })).toBe(false);
    expect(shouldHideSettledTransferEntry({
      error: null,
      loading: false,
      openCount: 0,
      saving: true,
      sheetActive: false
    })).toBe(false);
    expect(shouldHideSettledTransferEntry({
      error: 'Could not load transfers',
      loading: false,
      openCount: 0,
      saving: false,
      sheetActive: false
    })).toBe(false);
    expect(shouldHideSettledTransferEntry({
      error: null,
      loading: false,
      openCount: 0,
      saving: false,
      sheetActive: true
    })).toBe(false);
  });
});

function member(userId: string, displayName: string): LedgerMemberProfile {
  return {
    joined_at: '2026-06-01T00:00:00.000Z',
    ledger_id: 'ledger-id',
    user_id: userId,
    profile: {
      created_at: '2026-06-01T00:00:00.000Z',
      display_name: displayName,
      id: userId,
      updated_at: '2026-06-01T00:00:00.000Z'
    }
  };
}

function transferItem({
  amountYen,
  payeeUserId,
  payerUserId,
  spentOn = '2026-06-01'
}: {
  amountYen: number;
  payeeUserId: string;
  payerUserId: string;
  spentOn?: string;
}): TransferChecklistItemRow {
  return {
    amount_yen: amountYen,
    category: 'Food & Dining',
    category_id: 'food_dining',
    expense_created_at: '2026-06-01T00:00:00.000Z',
    expense_id: `${payerUserId}-${payeeUserId}-${amountYen}`,
    expense_updated_at: '2026-06-01T00:00:00.000Z',
    ledger_id: 'ledger-id',
    payee_completed_at: null,
    payee_user_id: payeeUserId,
    payer_completed_at: null,
    payer_user_id: payerUserId,
    spent_on: spentOn,
    subcategory: 'Groceries'
  };
}
