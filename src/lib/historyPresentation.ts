type ExpenseParticipantInput = {
  ownership: 'personal' | 'shared';
  paid_by: string;
  splits: readonly {
    amount_yen: number;
    user_id: string;
  }[];
};

export function participantBadgeUserIds(expense: ExpenseParticipantInput) {
  if (expense.ownership !== 'shared' || expense.splits.length === 0) {
    return [expense.paid_by];
  }

  const participantIds = uniqueUserIds(
    expense.splits
      .filter((split) => split.amount_yen > 0)
      .map((split) => split.user_id)
  );

  return participantIds.length > 0 ? participantIds : [expense.paid_by];
}

function uniqueUserIds(userIds: readonly string[]) {
  return [...new Set(userIds)];
}
