import {LedgerMember, SplitRule} from '../types';

export type ShareAmounts = {
  memberAShareAmountJpy: number;
  memberBShareAmountJpy: number;
};

export function calculateShareAmounts(
  amountJpy: number,
  splitRule: SplitRule,
  paidByMemberId: string,
  members: LedgerMember[],
): ShareAmounts {
  if (!Number.isInteger(amountJpy) || amountJpy < 0) {
    throw new Error('金額は 0 以上の整数で指定してください。');
  }

  if (splitRule.mode === 'amount') {
    const total =
      splitRule.memberAShareAmountJpy + splitRule.memberBShareAmountJpy;
    if (total !== amountJpy) {
      throw new Error('負担額の合計が支出金額と一致していません。');
    }

    return {
      memberAShareAmountJpy: splitRule.memberAShareAmountJpy,
      memberBShareAmountJpy: splitRule.memberBShareAmountJpy,
    };
  }

  const ratioTotal =
    splitRule.memberAShareRatio + splitRule.memberBShareRatio;
  if (ratioTotal <= 0) {
    throw new Error('分割割合は 0 より大きくしてください。');
  }

  const memberA = members.find(member => member.slot === 'member_a');
  const payerSlot =
    memberA?.id === paidByMemberId ? 'member_a' : 'member_b';
  const rawMemberA = Math.floor(
    (amountJpy * splitRule.memberAShareRatio) / ratioTotal,
  );
  const rawMemberB = Math.floor(
    (amountJpy * splitRule.memberBShareRatio) / ratioTotal,
  );
  const remainder = amountJpy - rawMemberA - rawMemberB;

  return {
    memberAShareAmountJpy:
      rawMemberA + (payerSlot === 'member_a' ? remainder : 0),
    memberBShareAmountJpy:
      rawMemberB + (payerSlot === 'member_b' ? remainder : 0),
  };
}
