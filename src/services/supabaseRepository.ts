import {RealtimeChannel} from '@supabase/supabase-js';
import {supabase} from '../config/supabase';
import {
  Category,
  Ledger,
  LedgerMember,
  LedgerSnapshot,
  RecurringTemplate,
  SplitRule,
  Transaction,
} from '../types';

type DbLedger = {
  id: string;
  name: string;
  invite_code: string;
  default_split_mode: 'ratio' | 'amount';
  default_member_a_ratio: number | null;
  default_member_b_ratio: number | null;
  default_member_a_amount_jpy: number | null;
  default_member_b_amount_jpy: number | null;
};

function splitRuleFromDb(row: DbLedger): SplitRule {
  if (row.default_split_mode === 'amount') {
    return {
      mode: 'amount',
      memberAShareAmountJpy: row.default_member_a_amount_jpy ?? 0,
      memberBShareAmountJpy: row.default_member_b_amount_jpy ?? 0,
    };
  }

  return {
    mode: 'ratio',
    memberAShareRatio: row.default_member_a_ratio ?? 50,
    memberBShareRatio: row.default_member_b_ratio ?? 50,
  };
}

export async function sendLoginCode(email: string) {
  const {error} = await supabase.auth.signInWithOtp({
    email,
    options: {shouldCreateUser: true},
  });
  if (error) {
    throw error;
  }
}

export async function createLedger(name: string, displayName: string) {
  const {data, error} = await supabase.rpc('create_ledger_with_owner', {
    ledger_name: name,
    member_display_name: displayName,
  });
  if (error) {
    throw error;
  }
  return data as string;
}

export async function joinLedger(inviteCode: string, displayName: string) {
  const {data, error} = await supabase.rpc('join_ledger_by_invite', {
    invite_code_input: inviteCode.trim().toUpperCase(),
    member_display_name: displayName,
  });
  if (error) {
    throw error;
  }
  return data as string;
}

export async function fetchLedgerSnapshot(): Promise<LedgerSnapshot | null> {
  const {data: memberships, error: membershipError} = await supabase
    .from('ledger_members')
    .select('ledger_id')
    .limit(1);
  if (membershipError) {
    throw membershipError;
  }
  const ledgerId = memberships?.[0]?.ledger_id;
  if (!ledgerId) {
    return null;
  }

  const [
    ledgerResult,
    membersResult,
    categoriesResult,
    transactionsResult,
    templatesResult,
  ] = await Promise.all([
    supabase.from('ledgers').select('*').eq('id', ledgerId).single(),
    supabase.from('ledger_members').select('*').eq('ledger_id', ledgerId),
    supabase.from('categories').select('*').eq('ledger_id', ledgerId),
    supabase
      .from('transactions')
      .select('*')
      .eq('ledger_id', ledgerId)
      .order('occurred_on', {ascending: false}),
    supabase
      .from('recurring_templates')
      .select('*')
      .eq('ledger_id', ledgerId)
      .order('generation_day', {ascending: true}),
  ]);

  if (ledgerResult.error) {
    throw ledgerResult.error;
  }
  if (membersResult.error) {
    throw membersResult.error;
  }
  if (categoriesResult.error) {
    throw categoriesResult.error;
  }
  if (transactionsResult.error) {
    throw transactionsResult.error;
  }
  if (templatesResult.error) {
    throw templatesResult.error;
  }

  const dbLedger = ledgerResult.data as DbLedger;
  const ledger: Ledger = {
    id: dbLedger.id,
    name: dbLedger.name,
    inviteCode: dbLedger.invite_code,
    defaultSplitRule: splitRuleFromDb(dbLedger),
    members: (membersResult.data ?? []).map(
      row =>
        ({
          id: row.id,
          userId: row.user_id,
          slot: row.slot,
          displayName: row.display_name,
        }) satisfies LedgerMember,
    ),
  };

  return {
    ledger,
    categories: (categoriesResult.data ?? []).map(
      row =>
        ({
          id: row.id,
          name: row.name,
          color: row.color,
        }) satisfies Category,
    ),
    transactions: (transactionsResult.data ?? []).map(
      row =>
        ({
          id: row.id,
          ledgerId: row.ledger_id,
          amountJpy: row.amount_jpy,
          scope: row.scope,
          status: row.status,
          categoryId: row.category_id,
          paidByMemberId: row.paid_by_member_id,
          ownerMemberId: row.owner_member_id,
          occurredOn: row.occurred_on,
          billingMonth: row.billing_month,
          note: row.note,
          splitMode: row.split_mode,
          memberAShareAmountJpy: row.member_a_share_amount_jpy,
          memberBShareAmountJpy: row.member_b_share_amount_jpy,
          recurringTemplateId: row.recurring_template_id,
          createdByMemberId: row.created_by_member_id,
        }) satisfies Transaction,
    ),
    recurringTemplates: (templatesResult.data ?? []).map(
      row =>
        ({
          id: row.id,
          ledgerId: row.ledger_id,
          name: row.name,
          templateKind: row.template_kind,
          categoryId: row.category_id,
          paidByMemberId: row.paid_by_member_id,
          amountJpy: row.amount_jpy,
          generationDay: row.generation_day,
          splitRule:
            row.split_mode === 'amount'
              ? {
                  mode: 'amount',
                  memberAShareAmountJpy: row.member_a_share_amount_jpy ?? 0,
                  memberBShareAmountJpy: row.member_b_share_amount_jpy ?? 0,
                }
              : {
                  mode: 'ratio',
                  memberAShareRatio: row.member_a_share_ratio ?? 50,
                  memberBShareRatio: row.member_b_share_ratio ?? 50,
                },
          isActive: row.is_active,
          lastGeneratedMonth: row.last_generated_month,
        }) satisfies RecurringTemplate,
    ),
  };
}

export async function insertTransaction(input: Omit<Transaction, 'id'>) {
  const {error} = await supabase.from('transactions').insert({
    ledger_id: input.ledgerId,
    amount_jpy: input.amountJpy,
    scope: input.scope,
    status: input.status,
    category_id: input.categoryId,
    paid_by_member_id: input.paidByMemberId,
    owner_member_id: input.ownerMemberId,
    occurred_on: input.occurredOn,
    billing_month: input.billingMonth,
    note: input.note,
    split_mode: input.splitMode,
    member_a_share_amount_jpy: input.memberAShareAmountJpy,
    member_b_share_amount_jpy: input.memberBShareAmountJpy,
    recurring_template_id: input.recurringTemplateId,
    created_by_member_id: input.createdByMemberId,
  });
  if (error) {
    throw error;
  }
}

export function subscribeLedger(
  ledgerId: string,
  onChange: () => void,
): RealtimeChannel {
  return supabase
    .channel(`ledger:${ledgerId}`)
    .on(
      'postgres_changes',
      {event: '*', schema: 'public', table: 'transactions', filter: `ledger_id=eq.${ledgerId}`},
      onChange,
    )
    .on(
      'postgres_changes',
      {event: '*', schema: 'public', table: 'recurring_templates', filter: `ledger_id=eq.${ledgerId}`},
      onChange,
    )
    .subscribe();
}
