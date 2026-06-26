import { describe, expect, it } from 'vitest';

import { participantBadgeUserIds } from './historyPresentation';

describe('history presentation helpers', () => {
  it('shows only users with positive shared split amounts in history badges', () => {
    expect(participantBadgeUserIds(expense({
      splits: [
        { user_id: 'alex', amount_yen: 1200 },
        { user_id: 'mina', amount_yen: 0 }
      ]
    }))).toEqual(['alex']);

    expect(participantBadgeUserIds(expense({
      splits: [
        { user_id: 'alex', amount_yen: 0 },
        { user_id: 'mina', amount_yen: 1200 }
      ]
    }))).toEqual(['mina']);
  });

  it('keeps both users when both shared split amounts are positive', () => {
    expect(participantBadgeUserIds(expense({
      splits: [
        { user_id: 'alex', amount_yen: 700 },
        { user_id: 'mina', amount_yen: 500 }
      ]
    }))).toEqual(['alex', 'mina']);
  });

  it('falls back to paidBy for personal or malformed zero shared splits', () => {
    expect(participantBadgeUserIds(expense({ ownership: 'personal', paid_by: 'mina', splits: [] }))).toEqual(['mina']);
    expect(participantBadgeUserIds(expense({
      paid_by: 'alex',
      splits: [
        { user_id: 'alex', amount_yen: 0 },
        { user_id: 'mina', amount_yen: 0 }
      ]
    }))).toEqual(['alex']);
  });
});

function expense(input: Partial<Parameters<typeof participantBadgeUserIds>[0]> = {}) {
  return {
    ownership: 'shared' as const,
    paid_by: 'alex',
    splits: [],
    ...input
  };
}
