import {LedgerMember, SettlementSummary, Transaction} from '../types';

function memberIdForSlot(members: LedgerMember[], slot: 'member_a' | 'member_b') {
  return members.find(member => member.slot === slot)?.id;
}

export function calculateSettlementSummary(
  transactions: Transaction[],
  members: LedgerMember[],
  month: string,
): SettlementSummary {
  const memberAId = memberIdForSlot(members, 'member_a');
  const memberBId = memberIdForSlot(members, 'member_b');

  let memberAPaidSharedJpy = 0;
  let memberBPaidSharedJpy = 0;
  let memberAShareJpy = 0;
  let memberBShareJpy = 0;
  let memberAPersonalJpy = 0;
  let memberBPersonalJpy = 0;
  let pendingSharedCount = 0;

  transactions
    .filter(transaction => transaction.occurredOn.startsWith(month))
    .forEach(transaction => {
      if (transaction.scope === 'shared') {
        if (transaction.status === 'pending_amount') {
          pendingSharedCount += 1;
          return;
        }

        if (transaction.paidByMemberId === memberAId) {
          memberAPaidSharedJpy += transaction.amountJpy ?? 0;
        }
        if (transaction.paidByMemberId === memberBId) {
          memberBPaidSharedJpy += transaction.amountJpy ?? 0;
        }
        memberAShareJpy += transaction.memberAShareAmountJpy;
        memberBShareJpy += transaction.memberBShareAmountJpy;
        return;
      }

      if (transaction.ownerMemberId === memberAId) {
        memberAPersonalJpy += transaction.amountJpy ?? 0;
      }
      if (transaction.ownerMemberId === memberBId) {
        memberBPersonalJpy += transaction.amountJpy ?? 0;
      }
    });

  const memberANet = memberAShareJpy - memberAPaidSharedJpy;
  const memberBNet = memberBShareJpy - memberBPaidSharedJpy;
  const amountJpy = Math.abs(memberANet);

  return {
    month,
    memberAPaidSharedJpy,
    memberBPaidSharedJpy,
    memberAShareJpy,
    memberBShareJpy,
    memberAPersonalJpy,
    memberBPersonalJpy,
    sharedTotalJpy: memberAShareJpy + memberBShareJpy,
    pendingSharedCount,
    direction:
      amountJpy === 0
        ? 'settled'
        : memberANet > memberBNet
          ? 'member_a_pays_member_b'
          : 'member_b_pays_member_a',
    amountJpy,
  };
}
