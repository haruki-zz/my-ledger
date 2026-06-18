import { supabase } from '@/src/lib/supabase';
import { isLocalDbUnavailableError } from '@/src/lib/localDb';
import {
  cacheTransferItems,
  deleteLocalExpense,
  deleteLocalLedgerCategory,
  deleteLocalRecurringRule,
  drainSyncQueue,
  getCachedExpense,
  getCachedExpenseByRecurringRule,
  getCachedExpenses,
  getCachedExpensesByMonth,
  getCachedFirstExpenseSpentOn,
  getCachedLedgerCategories,
  getCachedLedgerMembers,
  getCachedLedgerMemberships,
  getCachedProfiles,
  getCachedRecurringRules,
  getCachedTransferItems,
  hasCachedExpensesSnapshot,
  isLocalRepositoryOnline,
  refreshExpenses,
  refreshLedgerCategories,
  refreshLedgerMembers,
  refreshMemberships,
  refreshProfiles,
  refreshRecurringRules,
  saveLocalExpense,
  saveLocalLedgerCategory,
  saveLocalRecurringRule
} from '@/src/lib/localRepository';
import { currentMonthStartDate } from '@/src/lib/recurring';
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
  RecurringExpenseRule,
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

  return withLocalFallback(async () => {
    const cachedMemberships = await getCachedLedgerMemberships(userId);
    if (cachedMemberships.length > 0) {
      return mapLedgerMemberships(cachedMemberships as LedgerMembershipRow[], userId);
    }

    await ignoreOfflineError(() => refreshMemberships(userId));
    return mapLedgerMemberships((await getCachedLedgerMemberships(userId)) as LedgerMembershipRow[], userId);
  }, () => fetchRemoteLedgerMemberships(userId));
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
  return withLocalFallback(async () => {
    const cachedMembers = await getCachedLedgerMembers(ledgerId);
    if (cachedMembers.length > 0) {
      return cachedMembers;
    }

    await ignoreOfflineError(() => refreshLedgerMembers(ledgerId));
    return getCachedLedgerMembers(ledgerId);
  }, () => fetchRemoteLedgerMembers(ledgerId));
}

export async function getLedgerCategories(ledgerId: string): Promise<LedgerCategory[]> {
  return withLocalFallback(async () => {
    const cachedCategories = await getCachedLedgerCategories(ledgerId);
    if (cachedCategories.length > 0) {
      return cachedCategories;
    }

    await ignoreOfflineError(() => refreshLedgerCategories(ledgerId));
    return getCachedLedgerCategories(ledgerId);
  }, () => fetchRemoteLedgerCategories(ledgerId));
}

export async function getRecurringExpenseRules(
  ledgerId: string,
  options: { emitChange?: boolean; refreshFirst?: boolean } = {}
): Promise<RecurringExpenseRule[]> {
  return withLocalFallback(async () => {
    if (options.refreshFirst) {
      await ignoreOfflineError(() => refreshRecurringRules(ledgerId, { emitChange: options.emitChange }));
    }

    const cachedRules = await getCachedRecurringRules(ledgerId);
    if (cachedRules.length > 0) {
      refreshRecurringRules(ledgerId, { emitChange: options.emitChange }).catch((refreshError) => {
        console.warn('Background recurring rules refresh failed:', refreshError instanceof Error ? refreshError.message : String(refreshError));
      });
      return cachedRules;
    }
    try {
      await refreshRecurringRules(ledgerId, { emitChange: options.emitChange });
      return getCachedRecurringRules(ledgerId);
    } catch (error) {
      if (isOfflineError(error)) {
        return cachedRules;
      }
      throw error;
    }
  }, () => fetchRemoteRecurringRules(ledgerId));
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

async function withLocalFallback<T>(localFn: () => Promise<T>, remoteFn: () => Promise<T>): Promise<T> {
  try {
    return await localFn();
  } catch (error) {
    if (isLocalDbUnavailableError(error)) {
      return remoteFn();
    }
    throw error;
  }
}

async function ignoreOfflineError(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    if (!isOfflineError(error)) {
      throw error;
    }
  }
}

async function ignoreLocalCacheError(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    if (!isOfflineError(error) && !isLocalDbUnavailableError(error)) {
      throw error;
    }
  }
}

export type SaveLedgerCategoryInput = {
  ledgerId: string;
  categoryId: string;
  categoryName?: string | null;
  splitRatioA: number;
  splitRatioB: number;
  sortOrder: number;
};

export async function saveLedgerCategorySetting(input: SaveLedgerCategoryInput): Promise<LedgerCategory> {
  const savedCategory = await saveLocalLedgerCategory(input);
  if (!savedCategory) {
    throw new Error('Could not save category setting locally');
  }
  return savedCategory;
}

export const saveLedgerCategory = saveLedgerCategorySetting;

export type SaveRecurringExpenseRuleInput = {
  id?: string | null;
  ledgerId: string;
  name: string;
  categoryId: string;
  subcategory: string | null;
  amountYen: number;
  paidBy: string;
  ownership: ExpenseOwnership;
  splitRatioA: number;
  splitRatioB: number;
  splitAmountA: number | null;
  splitAmountB: number | null;
  generateDay: number;
  startMonth: string;
  endMonth: string | null;
  timezone?: string | null;
  isActive: boolean;
};

export async function saveRecurringExpenseRule(input: SaveRecurringExpenseRuleInput): Promise<RecurringExpenseRule> {
  try {
    const savedRule = await saveLocalRecurringRule(input);
    if (!savedRule) {
      throw new Error('Could not save fixed monthly expense locally');
    }
    return savedRule;
  } catch (error) {
    if (!isLocalDbUnavailableError(error)) {
      throw error;
    }

    return saveRemoteRecurringExpenseRule(input);
  }
}

export async function deleteRecurringExpenseRule(ledgerId: string, ruleId: string): Promise<void> {
  try {
    await deleteLocalRecurringRule(ruleId);
    return;
  } catch (error) {
    if (!isLocalDbUnavailableError(error)) {
      throw error;
    }
  }

  if (!isLocalRepositoryOnline()) {
    throw new Error('Deleting fixed monthly expenses requires an internet connection');
  }

  const { error } = await supabase.rpc('delete_recurring_expense_rule_offline', {
    p_rule_id: ruleId,
    p_ledger_id: ledgerId,
    p_base_updated_at: null
  });

  if (error) {
    throw error;
  }

  await ignoreLocalCacheError(() => refreshRecurringRules(ledgerId));
}

async function saveRemoteRecurringExpenseRule(input: SaveRecurringExpenseRuleInput): Promise<RecurringExpenseRule> {
  const { data, error } = await supabase.rpc('save_recurring_expense_rule_offline', {
    p_rule_id: input.id || createUuid(),
    p_ledger_id: input.ledgerId,
    p_name: input.name.trim(),
    p_category_id: input.categoryId,
    p_subcategory: input.subcategory?.trim() || null,
    p_amount_yen: input.amountYen,
    p_paid_by: input.paidBy,
    p_ownership: input.ownership,
    p_split_ratio_a: input.splitRatioA,
    p_split_ratio_b: input.splitRatioB,
    p_split_amount_a: input.splitAmountA,
    p_split_amount_b: input.splitAmountB,
    p_generate_day: input.generateDay,
    p_start_month: input.startMonth,
    p_end_month: input.endMonth,
    p_timezone: input.timezone?.trim() || 'Asia/Tokyo',
    p_is_active: input.isActive,
    p_base_updated_at: null
  });

  if (error) {
    throw error;
  }

  await ignoreLocalCacheError(() => refreshRecurringRules(input.ledgerId));
  return data as RecurringExpenseRule;
}

export type GenerateRecurringExpenseResult = {
  rule_id: string;
  recurring_month: string;
  expense_id: string | null;
  status: string;
  message: string | null;
};

export async function generateRecurringExpenses(
  ledgerId: string,
  untilMonth: string = currentMonthStartDate()
): Promise<GenerateRecurringExpenseResult[]> {
  if (!isLocalRepositoryOnline()) {
    return [];
  }

  try {
    await ignoreLocalCacheError(() => drainSyncQueue());

    const { data, error } = await supabase.rpc('generate_recurring_expenses', {
      p_ledger_id: ledgerId,
      p_until_month: untilMonth
    });

    if (error) {
      throw error;
    }

    const rows = (data || []) as GenerateRecurringExpenseResult[];
    const generatedRowsMayAffectCache = rows.some((row) => row.status === 'inserted' || row.status === 'exists');
    if (generatedRowsMayAffectCache) {
    await ignoreLocalCacheError(() => refreshExpenses(ledgerId, { force: true }));
    }

    return rows;
  } catch (error) {
    if (isOfflineError(error)) {
      return [];
    }
    throw error;
  }
}

export async function deleteRecurringGeneratedExpense(ledgerId: string, ruleId: string): Promise<void> {
  let row: { id: string } | null = null;
  try {
    row = await getCachedExpenseByRecurringRule(ledgerId, ruleId, currentMonthStartDate());
  } catch (error) {
    if (!isLocalDbUnavailableError(error)) {
      throw error;
    }
  }

  if (!row) {
    if (!isLocalRepositoryOnline()) {
      return;
    }

    const { data, error } = await supabase
      .from('expenses')
      .select('id, updated_at')
      .eq('ledger_id', ledgerId)
      .eq('recurring_rule_id', ruleId)
      .eq('recurring_month', currentMonthStartDate())
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return;
    }

    const { error: deleteError } = await supabase.rpc('delete_expense_offline', {
      p_expense_id: data.id,
      p_ledger_id: ledgerId,
      p_base_updated_at: data.updated_at
    });

    if (deleteError) {
      throw deleteError;
    }

      await ignoreLocalCacheError(() => refreshExpenses(ledgerId, { force: true }));
    return;
  }

  await deleteLocalExpense(row.id);
}

export async function deleteLedgerCategory(ledgerId: string, categoryName: string) {
  await deleteLocalLedgerCategory(ledgerId, categoryName);
}

export async function getProfiles(userIds: string[]): Promise<Record<string, Profile>> {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  if (uniqueIds.length === 0) {
    return {};
  }

  return withLocalFallback(async () => {
    const cachedProfiles = await getCachedProfiles(uniqueIds);
    const missingIds = uniqueIds.filter((id) => !cachedProfiles[id]);
    if (missingIds.length === 0) {
      return cachedProfiles;
    }

    let refreshedProfiles: Record<string, Profile> = {};
    await ignoreOfflineError(async () => {
      refreshedProfiles = await refreshProfiles(missingIds);
    });
    return {
      ...cachedProfiles,
      ...refreshedProfiles
    };
  }, () => fetchRemoteProfiles(uniqueIds));
}

export async function getExpenses(ledgerId: string): Promise<Expense[]> {
  return withLocalFallback(async () => {
    const cachedExpenses = await getCachedExpenses(ledgerId);
    if (cachedExpenses.length > 0 || await hasCachedExpensesSnapshot(ledgerId)) {
      return cachedExpenses;
    }

    await ignoreOfflineError(() => refreshExpenses(ledgerId));
    return getCachedExpenses(ledgerId);
  }, () => fetchRemoteExpenses(ledgerId));
}

export async function getExpensesByMonth(
  ledgerId: string,
  startDate: string,
  endDate: string,
  options: { refreshFirst?: boolean } = {}
): Promise<Expense[]> {
  return withLocalFallback(async () => {
    if (options.refreshFirst) {
      await ignoreOfflineError(() => refreshExpenses(ledgerId, { force: true }));
    }

    const cachedExpenses = await getCachedExpensesByMonth(ledgerId, startDate, endDate);
    if (cachedExpenses.length > 0 || await hasCachedExpensesSnapshot(ledgerId)) {
      return cachedExpenses;
    }

    await ignoreOfflineError(() => refreshExpenses(ledgerId));
    return getCachedExpensesByMonth(ledgerId, startDate, endDate);
  }, () => fetchRemoteExpenses(ledgerId, startDate, endDate));
}

export async function getFirstExpenseSpentOn(ledgerId: string): Promise<string | null> {
  return withLocalFallback(async () => {
    const cachedSpentOn = await getCachedFirstExpenseSpentOn(ledgerId);
    if (cachedSpentOn) {
      return cachedSpentOn;
    }

    if (await hasCachedExpensesSnapshot(ledgerId)) {
      return null;
    }

    await ignoreOfflineError(() => refreshExpenses(ledgerId));
    return getCachedFirstExpenseSpentOn(ledgerId);
  }, () => fetchRemoteFirstExpenseSpentOn(ledgerId));
}

export async function getExpense(expenseId: string): Promise<Expense> {
  return withLocalFallback(async () => {
    const cachedExpense = await getCachedExpense(expenseId);
    if (cachedExpense) {
      return cachedExpense;
    }

    return fetchRemoteExpense(expenseId);
  }, () => fetchRemoteExpense(expenseId));
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
  categoryId: string;
  category: string | null;
  subcategory: string | null;
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
  let cachedItems: TransferChecklistItemRow[] = [];
  try {
    cachedItems = await getCachedTransferItems(ledgerId);
  } catch (error) {
    if (!isLocalDbUnavailableError(error)) {
      throw error;
    }
  }
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

    try {
      await cacheTransferItems(ledgerId, data || []);
    } catch (cacheError) {
      if (!isLocalDbUnavailableError(cacheError)) {
        throw cacheError;
      }
    }
    return data || cachedItems;
  } catch (error) {
    if (!isOfflineError(error)) {
      throw error;
    }
    return cachedItems;
  }
}

async function fetchRemoteLedgerMemberships(userId: string): Promise<LedgerMembership[]> {
  const { data, error } = await supabase
    .from('ledger_members')
    .select('*, ledger:ledgers(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true });

  if (error) {
    throw error;
  }

  return mapLedgerMemberships((data || []) as LedgerMembershipRow[], userId);
}

async function fetchRemoteLedgerMembers(ledgerId: string): Promise<LedgerMemberProfile[]> {
  const { data: members, error } = await supabase
    .from('ledger_members')
    .select('*')
    .eq('ledger_id', ledgerId)
    .order('joined_at', { ascending: true });

  if (error) {
    throw error;
  }

  const profiles = await fetchRemoteProfiles((members || []).map((member) => member.user_id));
  return (members || []).map((member) => ({
    ledger_id: member.ledger_id,
    user_id: member.user_id,
    joined_at: member.joined_at,
    profile: profiles[member.user_id] || {
      id: member.user_id,
      display_name: 'User',
      created_at: member.joined_at,
      updated_at: member.joined_at
    }
  }));
}

async function fetchRemoteLedgerCategories(ledgerId: string): Promise<LedgerCategory[]> {
  const { data, error } = await supabase
    .from('ledger_categories')
    .select('*')
    .eq('ledger_id', ledgerId)
    .order('sort_order', { ascending: true })
    .order('category_id', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []) as LedgerCategory[];
}

async function fetchRemoteRecurringRules(ledgerId: string): Promise<RecurringExpenseRule[]> {
  const { data, error } = await supabase
    .from('recurring_expense_rules')
    .select('*')
    .eq('ledger_id', ledgerId)
    .order('is_active', { ascending: false })
    .order('category_id', { ascending: true })
    .order('subcategory', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []) as RecurringExpenseRule[];
}

async function fetchRemoteProfiles(userIds: string[]): Promise<Record<string, Profile>> {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  if (uniqueIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase.from('profiles').select('*').in('id', uniqueIds);
  if (error) {
    throw error;
  }
  return Object.fromEntries((data || []).map((profile) => [profile.id, profile as Profile]));
}

async function fetchRemoteExpenses(ledgerId: string, startDate?: string, endDate?: string): Promise<Expense[]> {
  let query = supabase
    .from('expenses')
    .select('*')
    .eq('ledger_id', ledgerId);

  if (startDate) {
    query = query.gte('spent_on', startDate);
  }

  if (endDate) {
    query = query.lte('spent_on', endDate);
  }

  const { data, error } = await query
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return attachSplits((data || []) as ExpenseRow[]);
}

async function fetchRemoteExpense(expenseId: string): Promise<Expense> {
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

async function fetchRemoteFirstExpenseSpentOn(ledgerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('expenses')
    .select('spent_on')
    .eq('ledger_id', ledgerId)
    .order('spent_on', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.spent_on || null;
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

function createUuid() {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) {
    return randomUuid;
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
