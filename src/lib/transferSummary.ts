import type { LedgerMemberProfile, TransferChecklistItemRow } from '@/src/types/database';

export type NetSummary = {
  amountYen: number;
  count: number;
  payerUserId: string | null;
  payeeUserId: string | null;
};

export function buildNetSummary(
  items: TransferChecklistItemRow[],
  members: LedgerMemberProfile[]
): NetSummary {
  const userIds = members.map((member) => member.user_id);
  const userIdSet = new Set(userIds);

  for (const item of items) {
    if (!userIdSet.has(item.payer_user_id)) {
      userIds.push(item.payer_user_id);
      userIdSet.add(item.payer_user_id);
    }

    if (!userIdSet.has(item.payee_user_id)) {
      userIds.push(item.payee_user_id);
      userIdSet.add(item.payee_user_id);
    }
  }

  const firstUserId = userIds[0] || null;
  const secondUserId = userIds.find((userId) => userId !== firstUserId) || null;
  let firstToSecond = 0;
  let secondToFirst = 0;

  for (const item of items) {
    if (item.payer_user_id === firstUserId && item.payee_user_id === secondUserId) {
      firstToSecond += item.amount_yen;
      continue;
    }

    if (item.payer_user_id === secondUserId && item.payee_user_id === firstUserId) {
      secondToFirst += item.amount_yen;
    }
  }

  const net = firstToSecond - secondToFirst;
  if (net > 0) {
    return {
      amountYen: net,
      count: items.length,
      payerUserId: firstUserId,
      payeeUserId: secondUserId
    };
  }

  if (net < 0) {
    return {
      amountYen: Math.abs(net),
      count: items.length,
      payerUserId: secondUserId,
      payeeUserId: firstUserId
    };
  }

  return {
    amountYen: 0,
    count: 0,
    payerUserId: null,
    payeeUserId: null
  };
}
