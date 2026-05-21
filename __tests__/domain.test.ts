import {buildRecurringTransaction, fillPendingVariableTransaction} from '../src/domain/recurring';
import {calculateSettlementSummary} from '../src/domain/settlement';
import {calculateShareAmounts} from '../src/domain/splitting';
import {demoSnapshot} from '../src/data/demoData';
import {RecurringTemplate, Transaction} from '../src/types';

const members = demoSnapshot.ledger.members;
const memberA = members[0];
const memberB = members[1];

describe('共有支出の分割', () => {
  test('割合分割で端数 1 円は支払者が負担する', () => {
    const result = calculateShareAmounts(
      101,
      {mode: 'ratio', memberAShareRatio: 50, memberBShareRatio: 50},
      memberA.id,
      members,
    );

    expect(result).toEqual({
      memberAShareAmountJpy: 51,
      memberBShareAmountJpy: 50,
    });
  });

  test('金額分割は合計が一致したときに保存できる', () => {
    const result = calculateShareAmounts(
      140000,
      {
        mode: 'amount',
        memberAShareAmountJpy: 80000,
        memberBShareAmountJpy: 60000,
      },
      memberB.id,
      members,
    );

    expect(result.memberAShareAmountJpy).toBe(80000);
    expect(result.memberBShareAmountJpy).toBe(60000);
  });

  test('金額分割の合計が支出額と違う場合は拒否する', () => {
    expect(() =>
      calculateShareAmounts(
        1000,
        {
          mode: 'amount',
          memberAShareAmountJpy: 400,
          memberBShareAmountJpy: 500,
        },
        memberA.id,
        members,
      ),
    ).toThrow('負担額の合計');
  });
});

describe('精算', () => {
  test('個人支出は共有精算に入らない', () => {
    const summary = calculateSettlementSummary(
      demoSnapshot.transactions,
      members,
      '2026-05',
    );

    expect(summary.sharedTotalJpy).toBe(172450);
    expect(summary.memberAPersonalJpy).toBe(3800);
    expect(summary.memberBPersonalJpy).toBe(5200);
    expect(summary.pendingSharedCount).toBe(1);
  });

  test('確定済み負担額と実際の支払額から精算方向を計算する', () => {
    const summary = calculateSettlementSummary(
      demoSnapshot.transactions,
      members,
      '2026-05',
    );

    expect(summary.direction).toBe('member_b_pays_member_a');
    expect(summary.amountJpy).toBe(74000);
  });
});

describe('定期支出', () => {
  test('固定金額テンプレートは正式な支出を生成する', () => {
    const template = demoSnapshot.recurringTemplates[0] as RecurringTemplate;
    const transaction = buildRecurringTransaction(
      template,
      members,
      '2026-06',
      memberA.id,
    );

    expect(transaction.status).toBe('confirmed');
    expect(transaction.amountJpy).toBe(160000);
    expect(transaction.billingMonth).toBe('2026-06');
    expect(transaction.memberAShareAmountJpy).toBe(80000);
    expect(transaction.memberBShareAmountJpy).toBe(80000);
  });

  test('変動金額テンプレートは未入力支出を生成し、入力後に精算対象になる', () => {
    const template = demoSnapshot.recurringTemplates[1] as RecurringTemplate;
    const pending = buildRecurringTransaction(
      template,
      members,
      '2026-06',
      memberB.id,
    );
    expect(pending.status).toBe('pending_amount');
    expect(pending.amountJpy).toBeNull();

    const filled = fillPendingVariableTransaction(
      pending as Transaction,
      21001,
      template.splitRule,
      members,
    );

    expect(filled.status).toBe('confirmed');
    expect(filled.amountJpy).toBe(21001);
    expect(filled.memberAShareAmountJpy).toBe(12600);
    expect(filled.memberBShareAmountJpy).toBe(8401);
  });
});
