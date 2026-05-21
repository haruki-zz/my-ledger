import {
  LedgerMember,
  RecurringTemplate,
  SplitRule,
  Transaction,
} from '../types';
import {calculateShareAmounts} from './splitting';

function dateForMonth(month: string, day: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const normalizedDay = Math.min(Math.max(day, 1), lastDay);
  return `${month}-${`${normalizedDay}`.padStart(2, '0')}`;
}

function splitRuleForPending(rule: SplitRule) {
  if (rule.mode === 'ratio') {
    return {
      splitMode: 'ratio' as const,
      memberAShareAmountJpy: 0,
      memberBShareAmountJpy: 0,
    };
  }

  return {
    splitMode: 'amount' as const,
    memberAShareAmountJpy: 0,
    memberBShareAmountJpy: 0,
  };
}

export function buildRecurringTransaction(
  template: RecurringTemplate,
  members: LedgerMember[],
  billingMonth: string,
  createdByMemberId: string,
): Transaction {
  const isVariable = template.templateKind === 'variable';
  const fixedAmountJpy = template.amountJpy ?? 0;
  const amountJpy = isVariable ? null : fixedAmountJpy;
  const shares = isVariable
    ? splitRuleForPending(template.splitRule)
    : {
        splitMode: template.splitRule.mode,
        ...calculateShareAmounts(
          fixedAmountJpy,
          template.splitRule,
          template.paidByMemberId,
          members,
        ),
      };

  return {
    id: `generated-${template.id}-${billingMonth}`,
    ledgerId: template.ledgerId,
    amountJpy,
    scope: 'shared',
    status: isVariable ? 'pending_amount' : 'confirmed',
    categoryId: template.categoryId,
    paidByMemberId: template.paidByMemberId,
    ownerMemberId: null,
    occurredOn: dateForMonth(billingMonth, template.generationDay),
    billingMonth,
    note: template.name,
    splitMode: shares.splitMode,
    memberAShareAmountJpy: shares.memberAShareAmountJpy,
    memberBShareAmountJpy: shares.memberBShareAmountJpy,
    recurringTemplateId: template.id,
    createdByMemberId,
  };
}

export function fillPendingVariableTransaction(
  transaction: Transaction,
  amountJpy: number,
  splitRule: SplitRule,
  members: LedgerMember[],
): Transaction {
  if (transaction.scope !== 'shared') {
    throw new Error('共有支出のみ金額入力できます。');
  }
  if (transaction.status !== 'pending_amount') {
    throw new Error('未入力の支出ではありません。');
  }
  if (!transaction.paidByMemberId) {
    throw new Error('支払者が設定されていません。');
  }

  const shares = calculateShareAmounts(
    amountJpy,
    splitRule,
    transaction.paidByMemberId,
    members,
  );

  return {
    ...transaction,
    amountJpy,
    status: 'confirmed',
    splitMode: splitRule.mode,
    memberAShareAmountJpy: shares.memberAShareAmountJpy,
    memberBShareAmountJpy: shares.memberBShareAmountJpy,
  };
}
