const SHARED_EXPENSE_EDIT_MESSAGE = 'This shared record needs two ledger members and cannot be edited while the ledger has one member.';
const SHARED_RECURRING_MESSAGE = 'Shared fixed expenses require two ledger members. Keep this rule inactive or invite a second member.';
const OPEN_TRANSFER_LEAVE_MESSAGE = 'Settle all shared transfer items before leaving this ledger.';

export function friendlyErrorMessage(error: unknown) {
  const rawMessage = rawErrorMessage(error);
  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes('shared expense must include every ledger member') ||
    (normalized.includes('split_count') && normalized.includes('ledger_member_count'))
  ) {
    return SHARED_EXPENSE_EDIT_MESSAGE;
  }

  if (
    normalized.includes('shared recurring expense requires two ledger members') ||
    normalized.includes('fixed monthly expenses require two ledger members')
  ) {
    return SHARED_RECURRING_MESSAGE;
  }

  if (
    normalized.includes('cannot leave ledger with open shared transfer confirmations') ||
    normalized.includes('settle all shared transfer items before leaving')
  ) {
    return OPEN_TRANSFER_LEAVE_MESSAGE;
  }

  return rawMessage;
}

function rawErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (!error || typeof error !== 'object') {
    return String(error);
  }

  const details = error as {
    code?: unknown;
    details?: unknown;
    hint?: unknown;
    message?: unknown;
  };
  const parts = [
    typeof details.message === 'string' ? details.message : null,
    typeof details.code === 'string' ? `code: ${details.code}` : null,
    typeof details.details === 'string' ? `details: ${details.details}` : null,
    typeof details.hint === 'string' ? `hint: ${details.hint}` : null
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(' - ');
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
