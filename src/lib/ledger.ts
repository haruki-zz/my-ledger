import { supabase } from '@/src/lib/supabase';
import {
  cacheTransferItems,
  deleteLocalExpense,
  deleteLocalLedgerCategory,
  getCachedExpense,
  getCachedExpenses,
  getCachedExpensesByMonth,
  getCachedFirstExpenseSpentOn,
  getCachedLedgerCategories,
  getCachedLedgerMembers,
  getCachedLedgerMemberships,
  getCachedProfiles,
  getCachedTransferItems,
  hasCachedExpensesSnapshot,
  isLocalRepositoryOnline,
  refreshExpenses,
  refreshLedgerCategories,
  refreshLedgerMembers,
  refreshMemberships,
  refreshProfiles,
  saveLocalExpense,
  saveLocalLedgerCategory
} from '@/src/lib/localRepository';
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

export async function getMyLedgerMemberships(currentUserId?: string | null): Promise<LedgerMembership[]> {
  let userId = currentUserId || null;
  if (!userId) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      throw userError;
    }
    userId = userData.user?.id || null;
  }

  if (!userId) {
    return [];
  }

  const cachedMemberships = await getCachedLedgerMemberships(userId);
  if (cachedMemberships.length > 0) {
    return mapLedgerMemberships(cachedMemberships as LedgerMembershipRow[], userId);
  }

  try {
    await refreshMemberships(userId);
  } catch (error) {
    if (!isOfflineError(error)) {
      throw error;
    }
  }
  return mapLedgerMemberships((await getCachedLedgerMemberships(userId)) as LedgerMembershipRow[], userId);
}

function mapLedgerMemberships(memberships: LedgerMembershipRow[], userId: string): LedgerMembership[] {
  return memberships
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
  const cachedMembers = await getCachedLedgerMembers(ledgerId);
  if (cachedMembers.length > 0) {
    return cachedMembers;
  }

  try {
    await refreshLedgerMembers(ledgerId);
  } catch (error) {
    if (!isOfflineError(error)) {
      throw error;
    }
  }
  return getCachedLedgerMembers(ledgerId);
}

export async function getLedgerCategories(ledgerId: string): Promise<LedgerCategory[]> {
  const cachedCategories = await getCachedLedgerCategories(ledgerId);
  if (cachedCategories.length > 0) {
    return cachedCategories;
  }

  try {
    await refreshLedgerCategories(ledgerId);
  } catch (error) {
    if (!isOfflineError(error)) {
      throw error;
    }
  }
  return getCachedLedgerCategories(ledgerId);
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

function isOfflineError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('fetch failed') ||
    message.includes('offline') ||
    message.includes('internet connection') ||
    message.includes('network request failed') ||
    message.includes('network error')
  );
}

export type SaveLedgerCategoryInput = {
  ledgerId: string;
  categoryName: string;
  splitRatioA: number;
  splitRatioB: number;
  sortOrder: number;
};

export async function saveLedgerCategory(input: SaveLedgerCategoryInput): Promise<LedgerCategory> {
  const savedCategory = await saveLocalLedgerCategory(input);
  if (!savedCategory) {
    throw new Error('Could not save category locally');
  }
  return savedCategory;
}

export async function deleteLedgerCategory(ledgerId: string, categoryName: string) {
  await deleteLocalLedgerCategory(ledgerId, categoryName);
}

export async function getProfiles(userIds: string[]): Promise<Record<string, Profile>> {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  if (uniqueIds.length === 0) {
    return {};
  }

  const cachedProfiles = await getCachedProfiles(uniqueIds);
  const missingIds = uniqueIds.filter((id) => !cachedProfiles[id]);
  if (missingIds.length === 0) {
    return cachedProfiles;
  }

  let refreshedProfiles: Record<string, Profile> = {};
  try {
    refreshedProfiles = await refreshProfiles(missingIds);
  } catch (error) {
    if (!isOfflineError(error)) {
      throw error;
    }
  }
  return {
    ...cachedProfiles,
    ...refreshedProfiles
  };
}

export async function getExpenses(ledgerId: string): Promise<Expense[]> {
  const cachedExpenses = await getCachedExpenses(ledgerId);
  if (cachedExpenses.length > 0 || await hasCachedExpensesSnapshot(ledgerId)) {
    return cachedExpenses;
  }

  try {
    await refreshExpenses(ledgerId);
  } catch (error) {
    if (!isOfflineError(error)) {
      throw error;
    }
  }
  return getCachedExpenses(ledgerId);
}

export async function getExpensesByMonth(
  ledgerId: string,
  startDate: string,
  endDate: string
): Promise<Expense[]> {
  const cachedExpenses = await getCachedExpensesByMonth(ledgerId, startDate, endDate);
  if (cachedExpenses.length > 0 || await hasCachedExpensesSnapshot(ledgerId)) {
    return cachedExpenses;
  }

  try {
    await refreshExpenses(ledgerId);
  } catch (error) {
    if (!isOfflineError(error)) {
      throw error;
    }
  }
  return getCachedExpensesByMonth(ledgerId, startDate, endDate);
}

export async function getFirstExpenseSpentOn(ledgerId: string): Promise<string | null> {
  const cachedSpentOn = await getCachedFirstExpenseSpentOn(ledgerId);
  if (cachedSpentOn) {
    return cachedSpentOn;
  }

  if (await hasCachedExpensesSnapshot(ledgerId)) {
    return null;
  }

  try {
    await refreshExpenses(ledgerId);
  } catch (error) {
    if (!isOfflineError(error)) {
      throw error;
    }
  }
  return getCachedFirstExpenseSpentOn(ledgerId);
}

export async function getExpense(expenseId: string): Promise<Expense> {
  const cachedExpense = await getCachedExpense(expenseId);
  if (cachedExpense) {
    return cachedExpense;
  }

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
  const expense = await saveLocalExpense(input);
  const { splits: _splits, ...row } = expense;
  return row;
}

export async function deleteExpense(expenseId: string) {
  await deleteLocalExpense(expenseId);
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
  const cachedItems = await getCachedTransferItems(ledgerId);
  if (!isLocalRepositoryOnline()) {
    return cachedItems;
  }

  try {
    const { data, error } = await supabase.rpc('get_open_transfer_items', {
      p_ledger_id: ledgerId
    });

    if (error) {
      throw error;
    }

    await cacheTransferItems(ledgerId, data || []);
    return data || cachedItems;
  } catch (error) {
    if (!isOfflineError(error)) {
      throw error;
    }
    return cachedItems;
  }
}

export async function setTransferConfirmations(updates: TransferConfirmationUpdate[]) {
  assertTransferConfirmationUpdates(updates);

  if (!isLocalRepositoryOnline()) {
    throw new Error('Transfer confirmations require an internet connection');
  }

  const { error } = await supabase.rpc('set_transfer_confirmations', {
    p_updates: updates
  });

  if (error) {
    throw error;
  }
}
