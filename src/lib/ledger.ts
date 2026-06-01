import { supabase } from '@/src/lib/supabase';
import type {
  Expense,
  ExpenseOwnership,
  ExpenseRow,
  ExpenseSplitRow,
  Ledger,
  LedgerCategory,
  LedgerMember,
  LedgerMemberProfile,
  Profile,
  TransferChecklistItemRow
} from '@/src/types/database';

export async function updateMyProfile(displayName: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw userError;
  }

  const userId = userData.user?.id;
  if (!userId) {
    throw new Error('Please sign in first');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName.trim() || 'User' })
    .eq('id', userId);

  if (error) {
    throw error;
  }
}

export type LedgerMembership = {
  ledger: Ledger;
  joined_at: string;
  user_id: string;
  isOwner: boolean;
};

type LedgerMembershipRow = LedgerMember & {
  ledger: Ledger | null;
};

export async function getMyLedgerMemberships(): Promise<LedgerMembership[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw userError;
  }

  const userId = userData.user?.id;
  if (!userId) {
    return [];
  }

  const { data: memberships, error: membershipError } = await supabase
    .from('ledger_members')
    .select('*, ledger:ledgers(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true });

  if (membershipError) {
    throw membershipError;
  }

  return ((memberships || []) as LedgerMembershipRow[])
    .map((membership) => {
      if (!membership.ledger) {
        return null;
      }

      return {
        ledger: membership.ledger,
        joined_at: membership.joined_at,
        user_id: membership.user_id,
        isOwner: membership.ledger.created_by === userId
      };
    })
    .filter((membership): membership is LedgerMembership => Boolean(membership));
}

export async function createLedger(name: string): Promise<Ledger> {
  const { data, error } = await supabase.rpc('create_ledger', {
    p_name: name.trim() || 'Shared Ledger'
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function joinLedger(inviteCode: string): Promise<Ledger> {
  const { data, error } = await supabase.rpc('join_ledger_by_invite', {
    p_invite_code: inviteCode.trim()
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function leaveLedger(ledgerId: string) {
  const { error } = await supabase.rpc('leave_ledger', {
    p_ledger_id: ledgerId
  });

  if (error) {
    throw error;
  }
}

export async function deleteLedger(ledgerId: string) {
  const { error } = await supabase.rpc('delete_ledger', {
    p_ledger_id: ledgerId
  });

  if (error) {
    throw error;
  }
}

export async function getLedgerMembers(ledgerId: string): Promise<LedgerMemberProfile[]> {
  const { data: members, error: membersError } = await supabase
    .from('ledger_members')
    .select('*')
    .eq('ledger_id', ledgerId)
    .order('joined_at', { ascending: true });

  if (membersError) {
    throw membersError;
  }

  const userIds = (members || []).map((member) => member.user_id);
  if (userIds.length === 0) {
    return [];
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .in('id', userIds);

  if (profilesError) {
    throw profilesError;
  }

  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));

  return (members || []).map((member: LedgerMember) => ({
    ...member,
    profile: profilesById.get(member.user_id) || {
      id: member.user_id,
      display_name: 'User',
      created_at: member.joined_at,
      updated_at: member.joined_at
    }
  }));
}

export async function getLedgerCategories(ledgerId: string): Promise<LedgerCategory[]> {
  const { data, error } = await supabase
    .from('ledger_categories')
    .select('*')
    .eq('ledger_id', ledgerId)
    .order('sort_order', { ascending: true })
    .order('category_name', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function seedDefaultLedgerCategories(ledgerId: string) {
  const { error } = await supabase.rpc('seed_default_categories', {
    p_ledger_id: ledgerId
  });

  if (error) {
    throw error;
  }
}

export function isLedgerCategoriesSchemaError(error: unknown) {
  const message = getErrorMessage(error);
  return (
    message.includes('ledger_categories') ||
    message.includes('seed_default_categories') ||
    message.includes('save_ledger_category') ||
    message.includes('delete_ledger_category')
  ) && (
    message.includes('Could not find') ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('relation') ||
    message.includes('function')
  );
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }

  return String(error);
}

export type SaveLedgerCategoryInput = {
  ledgerId: string;
  categoryName: string;
  splitRatioA: number;
  splitRatioB: number;
  sortOrder: number;
};

export async function saveLedgerCategory(input: SaveLedgerCategoryInput): Promise<LedgerCategory> {
  const { data, error } = await supabase.rpc('save_ledger_category', {
    p_ledger_id: input.ledgerId,
    p_category_name: input.categoryName,
    p_split_ratio_a: input.splitRatioA,
    p_split_ratio_b: input.splitRatioB,
    p_sort_order: input.sortOrder
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteLedgerCategory(ledgerId: string, categoryName: string) {
  const { error } = await supabase.rpc('delete_ledger_category', {
    p_ledger_id: ledgerId,
    p_category_name: categoryName
  });

  if (error) {
    throw error;
  }
}

export async function getProfiles(userIds: string[]): Promise<Record<string, Profile>> {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  if (uniqueIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase.from('profiles').select('*').in('id', uniqueIds);

  if (error) {
    throw error;
  }

  return Object.fromEntries((data || []).map((profile) => [profile.id, profile]));
}

export async function getExpenses(ledgerId: string): Promise<Expense[]> {
  const { data: rows, error: rowsError } = await supabase
    .from('expenses')
    .select('*')
    .eq('ledger_id', ledgerId)
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false });

  if (rowsError) {
    throw rowsError;
  }

  return attachSplits(rows || []);
}

export async function getExpensesByMonth(
  ledgerId: string,
  startDate: string,
  endDate: string
): Promise<Expense[]> {
  const { data: rows, error: rowsError } = await supabase
    .from('expenses')
    .select('*')
    .eq('ledger_id', ledgerId)
    .gte('spent_on', startDate)
    .lte('spent_on', endDate)
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false });

  if (rowsError) {
    throw rowsError;
  }

  return attachSplits(rows || []);
}

export async function getFirstExpenseSpentOn(ledgerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('expenses')
    .select('spent_on')
    .eq('ledger_id', ledgerId)
    .order('spent_on', { ascending: true })
    .limit(1);

  if (error) {
    throw error;
  }

  return data?.[0]?.spent_on || null;
}

export async function getExpense(expenseId: string): Promise<Expense> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', expenseId)
    .single();

  if (error) {
    throw error;
  }

  const [expense] = await attachSplits([data]);
  return expense;
}

async function attachSplits(expenses: ExpenseRow[]): Promise<Expense[]> {
  const expenseIds = expenses.map((expense) => expense.id);
  if (expenseIds.length === 0) {
    return [];
  }

  const { data: splits, error: splitsError } = await supabase
    .from('expense_splits')
    .select('*')
    .in('expense_id', expenseIds);

  if (splitsError) {
    throw splitsError;
  }

  const splitsByExpense = new Map<string, ExpenseSplitRow[]>();
  for (const split of splits || []) {
    const existing = splitsByExpense.get(split.expense_id) || [];
    existing.push(split);
    splitsByExpense.set(split.expense_id, existing);
  }

  return expenses.map((expense) => ({
    ...expense,
    splits: splitsByExpense.get(expense.id) || []
  }));
}

export type SaveExpenseInput = {
  id?: string | null;
  ledgerId: string;
  amountYen: number;
  category: string;
  paidBy: string;
  ownership: ExpenseOwnership;
  spentOn: string;
  note: string | null;
  splits: { user_id: string; amount_yen: number }[];
};

export async function saveExpense(input: SaveExpenseInput): Promise<ExpenseRow> {
  const { data, error } = await supabase.rpc('save_expense', {
    p_expense_id: input.id || null,
    p_ledger_id: input.ledgerId,
    p_amount_yen: input.amountYen,
    p_category: input.category,
    p_paid_by: input.paidBy,
    p_ownership: input.ownership,
    p_spent_on: input.spentOn,
    p_note: input.note,
    p_splits: input.splits
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteExpense(expenseId: string) {
  const { error } = await supabase.rpc('delete_expense', {
    p_expense_id: expenseId
  });

  if (error) {
    throw error;
  }
}

export type TransferConfirmationUpdate = {
  expense_id: string;
  confirmed: boolean;
};

function assertTransferConfirmationUpdates(updates: TransferConfirmationUpdate[]) {
  for (const update of updates) {
    if (!update.expense_id || typeof update.expense_id !== 'string' || typeof update.confirmed !== 'boolean') {
      throw new Error('Transfer confirmation updates require expense_id and confirmed');
    }
  }
}

export async function getOpenTransferItems(ledgerId: string): Promise<TransferChecklistItemRow[]> {
  const { data, error } = await supabase.rpc('get_open_transfer_items', {
    p_ledger_id: ledgerId
  });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function setTransferConfirmations(updates: TransferConfirmationUpdate[]) {
  assertTransferConfirmationUpdates(updates);

  const { error } = await supabase.rpc('set_transfer_confirmations', {
    p_updates: updates
  });

  if (error) {
    throw error;
  }
}
