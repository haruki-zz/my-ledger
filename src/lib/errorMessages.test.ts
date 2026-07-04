import { describe, expect, it } from 'vitest';

import { friendlyErrorMessage } from './errorMessages';

describe('friendlyErrorMessage', () => {
  it('maps shared expense member-count errors to an edit-safe message', () => {
    expect(friendlyErrorMessage(new Error('shared expense must include every ledger member'))).toBe(
      'This shared record needs two ledger members and cannot be edited while the ledger has one member.'
    );
  });

  it('maps shared recurring member-count errors to a fixed expense message', () => {
    expect(friendlyErrorMessage({ message: 'shared recurring expense requires two ledger members' })).toBe(
      'Shared fixed expenses require two ledger members. Keep this rule inactive or invite a second member.'
    );
  });

  it('maps open transfer leave errors to a settle-up message', () => {
    expect(friendlyErrorMessage({ message: 'cannot leave ledger with open shared transfer confirmations' })).toBe(
      'Settle all shared transfer items before leaving this ledger.'
    );
  });
});
