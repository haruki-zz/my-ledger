export type MemberSlot = 'member_a' | 'member_b';

export type ExpenseScope = 'personal' | 'shared';

export type TransactionStatus = 'confirmed' | 'pending_amount';

export type SplitMode = 'ratio' | 'amount';

export type TemplateKind = 'fixed' | 'variable';

export type Category = {
  id: string;
  name: string;
  color: string;
};

export type LedgerMember = {
  id: string;
  userId: string;
  slot: MemberSlot;
  displayName: string;
};

export type SplitRule =
  | {
      mode: 'ratio';
      memberAShareRatio: number;
      memberBShareRatio: number;
    }
  | {
      mode: 'amount';
      memberAShareAmountJpy: number;
      memberBShareAmountJpy: number;
    };

export type Transaction = {
  id: string;
  ledgerId: string;
  amountJpy: number | null;
  scope: ExpenseScope;
  status: TransactionStatus;
  categoryId: string;
  paidByMemberId: string | null;
  ownerMemberId: string | null;
  occurredOn: string;
  billingMonth: string | null;
  note: string | null;
  splitMode: SplitMode | null;
  memberAShareAmountJpy: number;
  memberBShareAmountJpy: number;
  recurringTemplateId: string | null;
  createdByMemberId: string;
};

export type RecurringTemplate = {
  id: string;
  ledgerId: string;
  name: string;
  templateKind: TemplateKind;
  categoryId: string;
  paidByMemberId: string;
  amountJpy: number | null;
  generationDay: number;
  splitRule: SplitRule;
  isActive: boolean;
  lastGeneratedMonth: string | null;
};

export type Ledger = {
  id: string;
  name: string;
  defaultSplitRule: SplitRule;
  inviteCode: string;
  members: LedgerMember[];
};

export type SettlementSummary = {
  month: string;
  memberAPaidSharedJpy: number;
  memberBPaidSharedJpy: number;
  memberAShareJpy: number;
  memberBShareJpy: number;
  memberAPersonalJpy: number;
  memberBPersonalJpy: number;
  sharedTotalJpy: number;
  pendingSharedCount: number;
  direction: 'member_a_pays_member_b' | 'member_b_pays_member_a' | 'settled';
  amountJpy: number;
};

export type LedgerSnapshot = {
  ledger: Ledger;
  categories: Category[];
  transactions: Transaction[];
  recurringTemplates: RecurringTemplate[];
};
