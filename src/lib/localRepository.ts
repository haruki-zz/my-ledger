import { supabase } from '@/src/lib/supabase';
import {
  getPrimaryCategory,
  mapLegacyCategoryToId,
  resolveCategory
} from '@/src/lib/categorySystem';
import { getLocalDb, withLocalTransaction } from '@/src/lib/localDb';
import { emitLedgerDataChanged } from '@/src/lib/localEvents';
import {
  mergeQueueAction,
  nextFailureState,
  type SyncAction,
  type SyncEntityType,
  type SyncQueueRecord
} from '@/src/lib/syncQueue';
import type {
  Expense,
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

type LocalExpenseRow = ExpenseRow & {
  local_status: string;
  deleted_locally: number;
  base_updated_at: string | null;
  last_synced_updated_at: string | null;
};

type LocalCategoryRow = LedgerCategory & {
  local_status: string;
  deleted_locally: number;
  base_updated_at: string | null;
  last_synced_updated_at: string | null;
};

type LocalRecurringRuleRow = RecurringExpenseRule & {
  is_active: boolean | number;
  local_status: string;
  deleted_locally: number;
  base_updated_at: string | null;
  last_synced_updated_at: string | null;
};

type SaveExpensePayload = {
  id: string;
  ledgerId: string;
  amountYen: number;
  categoryId: string;
  category: string | null;
  subcategory: string | null;
  paidBy: string;
  ownership: ExpenseRow['ownership'];
  spentOn: string;
  note: string | null;
  splits: { user_id: string; amount_yen: number }[];
};

type SaveCategoryPayload = {
  id: string;
  ledgerId: string;
  categoryId: string;
  categoryName: string | null;
  splitRatioA: number;
  splitRatioB: number;
  sortOrder: number;
};

type SaveRecurringRulePayload = {
  id: string;
  ledgerId: string;
  name: string;
  categoryId: string;
  subcategory: string | null;
  amountYen: number;
  paidBy: string;
  ownership: ExpenseRow['ownership'];
  splitRatioA: number;
  splitRatioB: number;
  generateDay: number;
  startMonth: string;
  endMonth: string | null;
  timezone: string;
  isActive: boolean;
};

type DrainRequester = () => void;
type LocalTransaction = {
  runAsync: (source: string, ...params: any[]) => Promise<unknown>;
  getFirstAsync: <T>(source: string, ...params: any[]) => Promise<T | null>;
};

let drainRequester: DrainRequester | null = null;
let online = true;
let draining = false;
let currentUserId: string | null = null;
const expenseRefreshesByLedger = new Map<string, Promise<void>>();

export function setSyncDrainRequester(requester: DrainRequester | null) {
  drainRequester = requester;
}

export function setLocalRepositoryOnline(nextOnline: boolean) {
  online = nextOnline;
}

export function setLocalRepositoryUserId(nextUserId: string | null) {
  currentUserId = nextUserId;
}

export function isLocalRepositoryOnline() {
  return online;
}

export function requestSyncDrain() {
  drainRequester?.();
}

export async function getSyncQueueSummary() {
  const db = await getLocalDb();
  const rows = await db.getAllAsync<{ status: string; count: number }>(
    'SELECT status, COUNT(*) as count FROM sync_queue GROUP BY status'
  );
  return {
    pending: rows.reduce((sum, row) => sum + (row.status === 'queued' || row.status === 'syncing' ? row.count : 0), 0),
    failed: rows.find((row) => row.status === 'failed')?.count || 0,
    conflict: rows.find((row) => row.status === 'conflict')?.count || 0,
    syncing: rows.find((row) => row.status === 'syncing')?.count || 0
  };
}

export async function getSyncQueueItems() {
  const db = await getLocalDb();
  const rows = await db.getAllAsync<SyncQueueRecord<string>>(
    `SELECT * FROM sync_queue
     WHERE status IN ('queued', 'syncing', 'failed', 'conflict')
     ORDER BY sequence ASC`
  );
  return rows.map((row) => ({
    ...row,
    payload: safeJsonParse(row.payload)
  }));
}

export async function retrySyncQueueItem(sequence: number) {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE sync_queue
     SET status = 'queued', error = NULL, retry_count = 0, next_attempt_at = 0, updated_at = ?
     WHERE sequence = ?`,
    now,
    sequence
  );
  requestSyncDrain();
  emitLedgerDataChanged();
}

export async function forceLocalSyncQueueItem(sequence: number) {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE sync_queue
     SET status = 'queued', error = NULL, base_updated_at = NULL, retry_count = 0, next_attempt_at = 0, updated_at = ?
     WHERE sequence = ?`,
    now,
    sequence
  );
  requestSyncDrain();
  emitLedgerDataChanged();
}

export async function discardLocalSyncQueueItem(sequence: number) {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<SyncQueueRecord<string>>('SELECT * FROM sync_queue WHERE sequence = ?', sequence);
  if (!row) {
    return;
  }

  await withLocalTransaction(async () => {
    await db.runAsync('DELETE FROM sync_queue WHERE sequence = ?', sequence);
    if (row.action === 'create') {
      if (row.entity_type === 'expense') {
        await db.runAsync('DELETE FROM expense_splits WHERE expense_id = ?', row.entity_id);
        await db.runAsync('DELETE FROM expenses WHERE id = ?', row.entity_id);
      } else if (row.entity_type === 'category') {
        await db.runAsync('DELETE FROM ledger_categories WHERE id = ?', row.entity_id);
      } else {
        await db.runAsync('DELETE FROM recurring_expense_rules WHERE id = ?', row.entity_id);
      }
    }
  });

  if (row.entity_type === 'expense') {
    await refreshExpenses(row.ledger_id);
  } else if (row.entity_type === 'category') {
    await refreshLedgerCategories(row.ledger_id);
  } else {
    await refreshRecurringRules(row.ledger_id);
  }
  emitLedgerDataChanged(row.ledger_id);
}

export async function getCachedLedgerMemberships(userId: string): Promise<(LedgerMember & { ledger: Ledger })[]> {
  const db = await getLocalDb();
  return db.getAllAsync(
    `SELECT
       lm.ledger_id, lm.user_id, lm.joined_at,
       l.id as "ledger.id", l.name as "ledger.name", l.invite_code as "ledger.invite_code",
       l.created_by as "ledger.created_by", l.created_at as "ledger.created_at", l.updated_at as "ledger.updated_at"
     FROM ledger_members lm
     JOIN ledgers l ON l.id = lm.ledger_id
     WHERE lm.user_id = ?
     ORDER BY lm.joined_at ASC`,
    userId
  ).then((rows: any[]) => rows.map((row) => ({
    ledger_id: row.ledger_id,
    user_id: row.user_id,
    joined_at: row.joined_at,
    ledger: {
      id: row['ledger.id'],
      name: row['ledger.name'],
      invite_code: row['ledger.invite_code'],
      created_by: row['ledger.created_by'],
      created_at: row['ledger.created_at'],
      updated_at: row['ledger.updated_at']
    }
  })));
}

export async function refreshMemberships(userId: string) {
  if (!online) {
    return;
  }

  const { data: memberships, error } = await supabase
    .from('ledger_members')
    .select('*, ledger:ledgers(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true });

  if (error) {
    throw error;
  }

  const db = await getLocalDb();
  await withLocalTransaction(async () => {
    for (const membership of memberships || []) {
      if (!membership.ledger) {
        continue;
      }
      await upsertLedger(db, membership.ledger as Ledger);
      await db.runAsync(
        'INSERT OR REPLACE INTO ledger_members (ledger_id, user_id, joined_at) VALUES (?, ?, ?)',
        membership.ledger_id,
        membership.user_id,
        membership.joined_at
      );
    }
  });
  emitLedgerDataChanged();
}

export async function getCachedLedgerMembers(ledgerId: string): Promise<LedgerMemberProfile[]> {
  const db = await getLocalDb();
  const rows = await db.getAllAsync<LedgerMember & Profile>(
    `SELECT
       lm.ledger_id, lm.user_id, lm.joined_at,
       p.id, p.display_name, p.created_at, p.updated_at
     FROM ledger_members lm
     LEFT JOIN profiles p ON p.id = lm.user_id
     WHERE lm.ledger_id = ?
     ORDER BY lm.joined_at ASC`,
    ledgerId
  );

  return rows.map((row) => ({
    ledger_id: row.ledger_id,
    user_id: row.user_id,
    joined_at: row.joined_at,
    profile: {
      id: row.id || row.user_id,
      display_name: row.display_name || 'User',
      created_at: row.created_at || row.joined_at,
      updated_at: row.updated_at || row.joined_at
    }
  }));
}

export async function refreshLedgerMembers(ledgerId: string) {
  if (!online) {
    return;
  }

  const { data: members, error: membersError } = await supabase
    .from('ledger_members')
    .select('*')
    .eq('ledger_id', ledgerId)
    .order('joined_at', { ascending: true });

  if (membersError) {
    throw membersError;
  }

  const userIds = (members || []).map((member) => member.user_id);
  const profiles = await fetchProfiles(userIds);
  const db = await getLocalDb();
  await withLocalTransaction(async () => {
    for (const member of members || []) {
      await db.runAsync(
        'INSERT OR REPLACE INTO ledger_members (ledger_id, user_id, joined_at) VALUES (?, ?, ?)',
        member.ledger_id,
        member.user_id,
        member.joined_at
      );
    }
    for (const profile of Object.values(profiles)) {
      await upsertProfile(db, profile);
    }
  });
  emitLedgerDataChanged(ledgerId);
}

export async function getCachedProfiles(userIds: string[]): Promise<Record<string, Profile>> {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  if (uniqueIds.length === 0) {
    return {};
  }

  const db = await getLocalDb();
  const placeholders = uniqueIds.map(() => '?').join(',');
  const rows = await db.getAllAsync<Profile>(`SELECT * FROM profiles WHERE id IN (${placeholders})`, uniqueIds);
  return Object.fromEntries(rows.map((profile) => [profile.id, profile]));
}

export async function refreshProfiles(userIds: string[]) {
  const profiles = await fetchProfiles(userIds);
  const db = await getLocalDb();
  await withLocalTransaction(async () => {
    for (const profile of Object.values(profiles)) {
      await upsertProfile(db, profile);
    }
  });
  emitLedgerDataChanged();
  return profiles;
}

export async function getCachedExpenses(ledgerId: string): Promise<Expense[]> {
  const db = await getLocalDb();
  const rows = await db.getAllAsync<LocalExpenseRow>(
    `SELECT * FROM expenses
     WHERE ledger_id = ? AND deleted_locally = 0
     ORDER BY spent_on DESC, created_at DESC`,
    ledgerId
  );
  return attachCachedSplits(rows);
}

export async function getCachedExpensesByMonth(ledgerId: string, startDate: string, endDate: string): Promise<Expense[]> {
  const db = await getLocalDb();
  const rows = await db.getAllAsync<LocalExpenseRow>(
    `SELECT * FROM expenses
     WHERE ledger_id = ? AND spent_on >= ? AND spent_on <= ? AND deleted_locally = 0
     ORDER BY spent_on DESC, created_at DESC`,
    ledgerId,
    startDate,
    endDate
  );
  return attachCachedSplits(rows);
}

export async function getCachedExpense(expenseId: string): Promise<Expense | null> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<LocalExpenseRow>(
    'SELECT * FROM expenses WHERE id = ? AND deleted_locally = 0',
    expenseId
  );
  if (!row) {
    return null;
  }

  const [expense] = await attachCachedSplits([row]);
  return expense || null;
}

export async function getCachedFirstExpenseSpentOn(ledgerId: string) {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ spent_on: string }>(
    `SELECT spent_on FROM expenses
     WHERE ledger_id = ? AND deleted_locally = 0
     ORDER BY spent_on ASC
     LIMIT 1`,
    ledgerId
  );
  return row?.spent_on || null;
}

export async function hasCachedExpensesSnapshot(ledgerId: string) {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM local_meta WHERE key = ?',
    `expenses_refreshed:${ledgerId}`
  );
  return Boolean(row);
}

export async function refreshExpenses(ledgerId: string) {
  if (!online) {
    return;
  }

  const existingRefresh = expenseRefreshesByLedger.get(ledgerId);
  if (existingRefresh) {
    return existingRefresh;
  }

  const refreshPromise = refreshExpensesOnce(ledgerId).finally(() => {
    expenseRefreshesByLedger.delete(ledgerId);
  });
  expenseRefreshesByLedger.set(ledgerId, refreshPromise);
  return refreshPromise;
}

async function refreshExpensesOnce(ledgerId: string) {
  if (!online) {
    return;
  }

  const { data: rows, error: rowsError } = await supabase
    .from('expenses')
    .select('*')
    .eq('ledger_id', ledgerId)
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false });

  if (rowsError) {
    throw rowsError;
  }

  const expenseIds = (rows || []).map((expense) => expense.id);
  const splits = expenseIds.length > 0 ? await fetchSplits(expenseIds) : [];
  const db = await getLocalDb();
  await withLocalTransaction(async () => {
    for (const expense of rows || []) {
      await upsertRemoteExpense(db, expense as ExpenseRow);
    }
    for (const expenseId of expenseIds) {
      await db.runAsync('DELETE FROM expense_splits WHERE expense_id = ?', expenseId);
    }
    for (const split of splits) {
      await db.runAsync(
        'INSERT OR REPLACE INTO expense_splits (expense_id, user_id, amount_yen) VALUES (?, ?, ?)',
        split.expense_id,
        split.user_id,
        split.amount_yen
      );
    }

    if (expenseIds.length > 0) {
      const placeholders = expenseIds.map(() => '?').join(',');
      await db.runAsync(
        `DELETE FROM expenses
         WHERE ledger_id = ? AND local_status = 'synced' AND id NOT IN (${placeholders})`,
        [ledgerId, ...expenseIds]
      );
    } else {
      await db.runAsync(
        `DELETE FROM expenses
         WHERE ledger_id = ? AND local_status = 'synced'`,
        ledgerId
      );
    }
    await db.runAsync(
      'INSERT OR REPLACE INTO local_meta (key, value) VALUES (?, ?)',
      `expenses_refreshed:${ledgerId}`,
      new Date().toISOString()
    );
  });
  emitLedgerDataChanged(ledgerId);
}

export async function saveLocalExpense(input: {
  id?: string | null;
  ledgerId: string;
  amountYen: number;
  categoryId: string;
  category: string | null;
  subcategory: string | null;
  paidBy: string;
  ownership: ExpenseRow['ownership'];
  spentOn: string;
  note: string | null;
  splits: { user_id: string; amount_yen: number }[];
}) {
  if (!currentUserId) {
    throw new Error('Please sign in first');
  }

  const db = await getLocalDb();
  const now = new Date().toISOString();
  const existing = input.id ? await getCachedExpense(input.id) : null;
  const expenseId = input.id || createUuid();
  const action: SyncAction = existing ? 'edit' : 'create';
  const baseUpdatedAt = existing?.updated_at || null;
  const resolvedCategory = resolveCategory({
    categoryId: input.categoryId,
    category: input.category,
    subcategory: input.subcategory
  });
  const legacyCategoryLabel = input.category || resolvedCategory.label;
  const payload: SaveExpensePayload = {
    id: expenseId,
    ledgerId: input.ledgerId,
    amountYen: input.amountYen,
    categoryId: resolvedCategory.categoryId,
    category: legacyCategoryLabel,
    subcategory: resolvedCategory.subcategory,
    paidBy: input.paidBy,
    ownership: input.ownership,
    spentOn: input.spentOn,
    note: input.note,
    splits: input.splits
  };

  await withLocalTransaction(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO expenses (
         id, ledger_id, amount_yen, category, category_id, subcategory, recurring_rule_id, recurring_month,
         paid_by, recorded_by, ownership, spent_on, note,
         created_at, updated_at, local_status, deleted_locally, base_updated_at, last_synced_updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
      expenseId,
      input.ledgerId,
      input.amountYen,
      legacyCategoryLabel,
      resolvedCategory.categoryId,
      resolvedCategory.subcategory,
      existing?.recurring_rule_id || null,
      existing?.recurring_month || null,
      input.paidBy,
      existing?.recorded_by || currentUserId,
      input.ownership,
      input.spentOn,
      input.note,
      existing?.created_at || now,
      now,
      baseUpdatedAt,
      existing?.updated_at || null
    );
    await db.runAsync('DELETE FROM expense_splits WHERE expense_id = ?', expenseId);
    for (const split of input.splits) {
      await db.runAsync(
        'INSERT OR REPLACE INTO expense_splits (expense_id, user_id, amount_yen) VALUES (?, ?, ?)',
        expenseId,
        split.user_id,
        split.amount_yen
      );
    }
    await enqueueMutation(db, 'expense', expenseId, input.ledgerId, action, payload, baseUpdatedAt);
  });

  emitLedgerDataChanged(input.ledgerId);
  requestSyncDrain();
  return (await getCachedExpense(expenseId)) as Expense;
}

export async function deleteLocalExpense(expenseId: string) {
  const expense = await getCachedExpense(expenseId);
  if (!expense) {
    throw new Error('Expense is not available locally');
  }

  const db = await getLocalDb();
  const now = new Date().toISOString();
  await withLocalTransaction(async () => {
    await db.runAsync(
      `UPDATE expenses
       SET local_status = 'pending', deleted_locally = 1, updated_at = ?, base_updated_at = ?
       WHERE id = ?`,
      now,
      expense.updated_at,
      expenseId
    );
    await enqueueMutation(db, 'expense', expenseId, expense.ledger_id, 'delete', { id: expenseId }, expense.updated_at);
  });

  emitLedgerDataChanged(expense.ledger_id);
  requestSyncDrain();
}

export async function getCachedLedgerCategories(ledgerId: string): Promise<LedgerCategory[]> {
  const db = await getLocalDb();
  return db.getAllAsync<LedgerCategory>(
    `SELECT id, ledger_id, category_id, category_name, split_ratio_a, split_ratio_b, sort_order, created_at, updated_at
     FROM ledger_categories
     WHERE ledger_id = ? AND deleted_locally = 0
     ORDER BY sort_order ASC, category_id ASC`,
    ledgerId
  );
}

export async function refreshLedgerCategories(ledgerId: string) {
  if (!online) {
    return;
  }

  const { data, error } = await supabase
    .from('ledger_categories')
    .select('*')
    .eq('ledger_id', ledgerId)
    .order('sort_order', { ascending: true })
    .order('category_id', { ascending: true });

  if (error) {
    throw error;
  }

  const categoryIds = (data || []).map((category) => category.id);
  const db = await getLocalDb();
  await withLocalTransaction(async () => {
    for (const category of data || []) {
      await upsertRemoteCategory(db, category as LedgerCategory);
    }
    if (categoryIds.length > 0) {
      const placeholders = categoryIds.map(() => '?').join(',');
      await db.runAsync(
        `DELETE FROM ledger_categories
         WHERE ledger_id = ? AND local_status = 'synced' AND id NOT IN (${placeholders})`,
        [ledgerId, ...categoryIds]
      );
    } else {
      await db.runAsync(
        `DELETE FROM ledger_categories
         WHERE ledger_id = ? AND local_status = 'synced'`,
        ledgerId
      );
    }
  });
  emitLedgerDataChanged(ledgerId);
}

export async function getCachedRecurringRules(ledgerId: string): Promise<RecurringExpenseRule[]> {
  const db = await getLocalDb();
  const rows = await db.getAllAsync<LocalRecurringRuleRow>(
    `SELECT id, ledger_id, name, category_id, subcategory, amount_yen, paid_by, ownership, split_ratio_a, split_ratio_b,
       generate_day, start_month, end_month, timezone, is_active, created_by, created_at, updated_at
     FROM recurring_expense_rules
     WHERE ledger_id = ? AND deleted_locally = 0
     ORDER BY is_active DESC, category_id ASC, subcategory ASC, name ASC`,
    ledgerId
  );
  return rows.map(mapLocalRecurringRule);
}

export async function refreshRecurringRules(ledgerId: string) {
  if (!online) {
    return;
  }

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

  const ruleIds = (data || []).map((rule) => rule.id);
  const db = await getLocalDb();
  await withLocalTransaction(async () => {
    for (const rule of data || []) {
      await upsertRemoteRecurringRule(db, rule as RecurringExpenseRule);
    }
    if (ruleIds.length > 0) {
      const placeholders = ruleIds.map(() => '?').join(',');
      await db.runAsync(
        `DELETE FROM recurring_expense_rules
         WHERE ledger_id = ? AND local_status = 'synced' AND id NOT IN (${placeholders})`,
        [ledgerId, ...ruleIds]
      );
    } else {
      await db.runAsync(
        `DELETE FROM recurring_expense_rules
         WHERE ledger_id = ? AND local_status = 'synced'`,
        ledgerId
      );
    }
  });
  emitLedgerDataChanged(ledgerId);
}

export async function refreshLedgerLocalData(ledgerId: string) {
  await Promise.allSettled([
    refreshExpenses(ledgerId),
    refreshLedgerCategories(ledgerId),
    refreshLedgerMembers(ledgerId),
    refreshRecurringRules(ledgerId)
  ]);
}

export async function saveLocalRecurringRule(input: {
  id?: string | null;
  ledgerId: string;
  name: string;
  categoryId: string;
  subcategory: string | null;
  amountYen: number;
  paidBy: string;
  ownership: ExpenseRow['ownership'];
  splitRatioA: number;
  splitRatioB: number;
  generateDay: number;
  startMonth: string;
  endMonth: string | null;
  timezone?: string | null;
  isActive: boolean;
}) {
  if (!currentUserId) {
    throw new Error('Please sign in first');
  }

  const db = await getLocalDb();
  const now = new Date().toISOString();
  const ruleId = input.id || createUuid();
  const existing = input.id
    ? await db.getFirstAsync<LocalRecurringRuleRow>('SELECT * FROM recurring_expense_rules WHERE id = ?', input.id)
    : null;
  const action: SyncAction = existing && existing.deleted_locally === 0 ? 'edit' : 'create';
  const baseUpdatedAt = existing?.updated_at || null;
  const primaryCategory = getPrimaryCategory(input.categoryId);
  const timezone = input.timezone?.trim() || 'Asia/Tokyo';
  const payload: SaveRecurringRulePayload = {
    id: ruleId,
    ledgerId: input.ledgerId,
    name: input.name.trim(),
    categoryId: primaryCategory.id,
    subcategory: input.subcategory?.trim() || null,
    amountYen: input.amountYen,
    paidBy: input.paidBy,
    ownership: input.ownership,
    splitRatioA: input.splitRatioA,
    splitRatioB: input.splitRatioB,
    generateDay: input.generateDay,
    startMonth: input.startMonth,
    endMonth: input.endMonth,
    timezone,
    isActive: input.isActive
  };

  await withLocalTransaction(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO recurring_expense_rules (
         id, ledger_id, name, category_id, subcategory, amount_yen, paid_by, ownership, split_ratio_a, split_ratio_b,
         generate_day, start_month, end_month, timezone, is_active, created_by, created_at, updated_at,
         local_status, deleted_locally, base_updated_at, last_synced_updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
      ruleId,
      input.ledgerId,
      payload.name,
      primaryCategory.id,
      payload.subcategory,
      input.amountYen,
      input.paidBy,
      input.ownership,
      input.splitRatioA,
      input.splitRatioB,
      input.generateDay,
      input.startMonth,
      input.endMonth,
      timezone,
      input.isActive ? 1 : 0,
      existing?.created_by || currentUserId,
      existing?.created_at || now,
      now,
      baseUpdatedAt,
      existing?.updated_at || null
    );
    await enqueueMutation(db, 'recurring_rule', ruleId, input.ledgerId, action, payload, baseUpdatedAt);
  });

  emitLedgerDataChanged(input.ledgerId);
  requestSyncDrain();
  return (await getCachedRecurringRules(input.ledgerId)).find((rule) => rule.id === ruleId);
}

export async function saveLocalLedgerCategory(input: {
  ledgerId: string;
  categoryId: string;
  categoryName?: string | null;
  splitRatioA: number;
  splitRatioB: number;
  sortOrder: number;
}) {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  const primaryCategory = getPrimaryCategory(input.categoryId);
  const categoryName = input.categoryName || primaryCategory.label;
  const existing = await db.getFirstAsync<LocalCategoryRow>(
    'SELECT * FROM ledger_categories WHERE ledger_id = ? AND category_id = ?',
    input.ledgerId,
    primaryCategory.id
  );
  const categoryId = existing?.id || createUuid();
  const action: SyncAction = existing && existing.deleted_locally === 0 ? 'edit' : 'create';
  const baseUpdatedAt = existing?.updated_at || null;
  const payload: SaveCategoryPayload = {
    id: categoryId,
    ledgerId: input.ledgerId,
    categoryId: primaryCategory.id,
    categoryName,
    splitRatioA: input.splitRatioA,
    splitRatioB: input.splitRatioB,
    sortOrder: input.sortOrder
  };

  await withLocalTransaction(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO ledger_categories (
         id, ledger_id, category_id, category_name, split_ratio_a, split_ratio_b, sort_order, created_at, updated_at,
         local_status, deleted_locally, base_updated_at, last_synced_updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
      categoryId,
      input.ledgerId,
      primaryCategory.id,
      categoryName,
      input.splitRatioA,
      input.splitRatioB,
      input.sortOrder,
      existing?.created_at || now,
      now,
      baseUpdatedAt,
      existing?.updated_at || null
    );
    await enqueueMutation(db, 'category', categoryId, input.ledgerId, action, payload, baseUpdatedAt);
  });

  emitLedgerDataChanged(input.ledgerId);
  requestSyncDrain();
  return (await getCachedLedgerCategories(input.ledgerId)).find((category) => category.id === categoryId);
}

export async function deleteLocalLedgerCategory(ledgerId: string, categoryName: string) {
  const db = await getLocalDb();
  const category = await db.getFirstAsync<LocalCategoryRow>(
    'SELECT * FROM ledger_categories WHERE ledger_id = ? AND category_name = ? AND deleted_locally = 0',
    ledgerId,
    categoryName
  );
  if (!category) {
    throw new Error('Category is not available locally');
  }

  const now = new Date().toISOString();
  await withLocalTransaction(async () => {
    await db.runAsync(
      `UPDATE ledger_categories
       SET local_status = 'pending', deleted_locally = 1, updated_at = ?, base_updated_at = ?
       WHERE id = ?`,
      now,
      category.updated_at,
      category.id
    );
    await enqueueMutation(db, 'category', category.id, ledgerId, 'delete', {
      id: category.id,
      ledgerId,
      categoryName
    }, category.updated_at);
  });

  emitLedgerDataChanged(ledgerId);
  requestSyncDrain();
}

export async function getCachedTransferItems(ledgerId: string): Promise<TransferChecklistItemRow[]> {
  const db = await getLocalDb();
  return db.getAllAsync<TransferChecklistItemRow>(
    `SELECT expense_id, ledger_id, category, category_id, subcategory, spent_on, expense_created_at, expense_updated_at,
       payer_user_id, payee_user_id, amount_yen, payer_completed_at, payee_completed_at
     FROM transfer_checklist_snapshot
     WHERE ledger_id = ?
     ORDER BY spent_on DESC, expense_created_at DESC`,
    ledgerId
  );
}

export async function cacheTransferItems(ledgerId: string, items: TransferChecklistItemRow[]) {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  await withLocalTransaction(async () => {
    await db.runAsync('DELETE FROM transfer_checklist_snapshot WHERE ledger_id = ?', ledgerId);
    for (const item of items) {
      const resolvedCategory = resolveCategory({
        categoryId: item.category_id,
        category: item.category,
        subcategory: item.subcategory
      });
      await db.runAsync(
        `INSERT OR REPLACE INTO transfer_checklist_snapshot (
           expense_id, ledger_id, category, category_id, subcategory, spent_on, expense_created_at, expense_updated_at,
           payer_user_id, payee_user_id, amount_yen, payer_completed_at, payee_completed_at, cached_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item.expense_id,
        item.ledger_id,
        item.category || resolvedCategory.label,
        resolvedCategory.categoryId,
        resolvedCategory.subcategory,
        item.spent_on,
        item.expense_created_at,
        item.expense_updated_at,
        item.payer_user_id,
        item.payee_user_id,
        item.amount_yen,
        item.payer_completed_at,
        item.payee_completed_at,
        now
      );
    }
  });
}

export async function drainSyncQueue() {
  if (!online || draining) {
    return;
  }

  draining = true;
  try {
    const db = await getLocalDb();
    while (online) {
      const now = Date.now();
      const row = await db.getFirstAsync<SyncQueueRecord<string>>(
        `SELECT * FROM sync_queue
         WHERE status = 'queued'
            OR (status = 'failed' AND next_attempt_at > 0 AND next_attempt_at <= ?)
         ORDER BY sequence ASC
         LIMIT 1`,
        now
      );

      if (!row) {
        break;
      }

      await db.runAsync('UPDATE sync_queue SET status = ?, updated_at = ? WHERE sequence = ?', 'syncing', new Date().toISOString(), row.sequence);
      emitLedgerDataChanged(row.ledger_id);

      try {
        await syncQueueRow({ ...row, payload: safeJsonParse(row.payload) });
        await db.runAsync('DELETE FROM sync_queue WHERE sequence = ?', row.sequence);
        emitLedgerDataChanged(row.ledger_id);
      } catch (syncError) {
        const failure = nextFailureState(syncError, row.retry_count);
        const message = syncError instanceof Error ? syncError.message : String(syncError);
        await db.runAsync(
          `UPDATE sync_queue
           SET status = ?, error = ?, retry_count = ?, next_attempt_at = ?, updated_at = ?
           WHERE sequence = ?`,
          failure.status,
          message,
          failure.retryCount,
          failure.nextAttemptAt,
          new Date().toISOString(),
          row.sequence
        );
        await markLocalEntityStatus(row.entity_type, row.entity_id, failure.status);
        emitLedgerDataChanged(row.ledger_id);
      }
    }
  } finally {
    draining = false;
  }
}

async function syncQueueRow(row: SyncQueueRecord<unknown>) {
  if (row.entity_type === 'expense') {
    if (row.action === 'delete') {
      const payload = row.payload as { id: string };
      const { error } = await supabase.rpc('delete_expense_offline', {
        p_expense_id: payload.id,
        p_ledger_id: row.ledger_id,
        p_base_updated_at: row.base_updated_at
      });
      if (error) {
        throw error;
      }
      const db = await getLocalDb();
      await withLocalTransaction(async () => {
        await db.runAsync('DELETE FROM expense_splits WHERE expense_id = ?', payload.id);
        await db.runAsync('DELETE FROM expenses WHERE id = ?', payload.id);
      });
      return;
    }

    const payload = row.payload as SaveExpensePayload;
    const { data, error } = await supabase.rpc('save_expense_offline', {
      p_expense_id: payload.id,
      p_ledger_id: payload.ledgerId,
      p_amount_yen: payload.amountYen,
      p_category_id: payload.categoryId,
      p_category: payload.category,
      p_subcategory: payload.subcategory,
      p_paid_by: payload.paidBy,
      p_ownership: payload.ownership,
      p_spent_on: payload.spentOn,
      p_note: payload.note,
      p_splits: payload.splits,
      p_base_updated_at: row.base_updated_at
    });
    if (error) {
      throw error;
    }
    await cacheSyncedExpense(data as ExpenseRow, payload.splits);
    return;
  }

  if (row.entity_type === 'recurring_rule') {
    if (row.action === 'delete') {
      throw new Error('Recurring rule delete is not supported; deactivate the rule instead');
    }

    const payload = row.payload as SaveRecurringRulePayload;
    const { data, error } = await supabase.rpc('save_recurring_expense_rule_offline', {
      p_rule_id: payload.id,
      p_ledger_id: payload.ledgerId,
      p_name: payload.name,
      p_category_id: payload.categoryId,
      p_subcategory: payload.subcategory,
      p_amount_yen: payload.amountYen,
      p_paid_by: payload.paidBy,
      p_ownership: payload.ownership,
      p_split_ratio_a: payload.splitRatioA,
      p_split_ratio_b: payload.splitRatioB,
      p_generate_day: payload.generateDay,
      p_start_month: payload.startMonth,
      p_end_month: payload.endMonth,
      p_timezone: payload.timezone,
      p_is_active: payload.isActive,
      p_base_updated_at: row.base_updated_at
    });
    if (error) {
      throw error;
    }
    await cacheSyncedRecurringRule(data as RecurringExpenseRule);
    return;
  }

  if (row.action === 'delete') {
    const payload = row.payload as { id: string; ledgerId: string; categoryName: string };
    const { error } = await supabase.rpc('delete_ledger_category_offline', {
      p_category_id: payload.id,
      p_ledger_id: payload.ledgerId,
      p_category_name: payload.categoryName,
      p_base_updated_at: row.base_updated_at
    });
    if (error) {
      throw error;
    }
    const db = await getLocalDb();
    await db.runAsync('DELETE FROM ledger_categories WHERE id = ?', payload.id);
    return;
  }

  const payload = row.payload as SaveCategoryPayload;
  const { data, error } = await supabase.rpc('save_ledger_category_offline', {
    p_category_id: payload.id,
    p_ledger_id: payload.ledgerId,
    p_primary_category_id: payload.categoryId,
    p_category_name: payload.categoryName,
    p_split_ratio_a: payload.splitRatioA,
    p_split_ratio_b: payload.splitRatioB,
    p_sort_order: payload.sortOrder,
    p_base_updated_at: row.base_updated_at
  });
  if (error) {
    throw error;
  }
  await cacheSyncedCategory(data as LedgerCategory);
}

async function cacheSyncedExpense(expense: ExpenseRow, splits: { user_id: string; amount_yen: number }[]) {
  const db = await getLocalDb();
  await withLocalTransaction(async () => {
    await upsertRemoteExpense(db, expense, true);
    await db.runAsync('DELETE FROM expense_splits WHERE expense_id = ?', expense.id);
    for (const split of splits) {
      await db.runAsync(
        'INSERT OR REPLACE INTO expense_splits (expense_id, user_id, amount_yen) VALUES (?, ?, ?)',
        expense.id,
        split.user_id,
        split.amount_yen
      );
    }
    await db.runAsync(
      'INSERT OR REPLACE INTO sync_dedupe (entity_type, entity_id, updated_at) VALUES (?, ?, ?)',
      'expense',
      expense.id,
      expense.updated_at
    );
  });
}

async function cacheSyncedCategory(category: LedgerCategory) {
  const db = await getLocalDb();
  await withLocalTransaction(async () => {
    await upsertRemoteCategory(db, category, true);
    await db.runAsync(
      'INSERT OR REPLACE INTO sync_dedupe (entity_type, entity_id, updated_at) VALUES (?, ?, ?)',
      'category',
      category.id,
      category.updated_at
    );
  });
}

async function cacheSyncedRecurringRule(rule: RecurringExpenseRule) {
  const db = await getLocalDb();
  await withLocalTransaction(async () => {
    await upsertRemoteRecurringRule(db, rule, true);
    await db.runAsync(
      'INSERT OR REPLACE INTO sync_dedupe (entity_type, entity_id, updated_at) VALUES (?, ?, ?)',
      'recurring_rule',
      rule.id,
      rule.updated_at
    );
  });
}

async function enqueueMutation(
  tx: LocalTransaction,
  entityType: SyncEntityType,
  entityId: string,
  ledgerId: string,
  action: SyncAction,
  payload: unknown,
  baseUpdatedAt: string | null
) {
  const existing = await tx.getFirstAsync<Pick<SyncQueueRecord, 'sequence' | 'action'>>(
    `SELECT sequence, action FROM sync_queue
     WHERE entity_type = ? AND entity_id = ? AND status IN ('queued', 'syncing', 'failed', 'conflict')
     ORDER BY sequence ASC
     LIMIT 1`,
    entityType,
    entityId
  );
  const decision = mergeQueueAction(existing, action);
  const now = new Date().toISOString();

  if (decision.kind === 'drop') {
    if (decision.sequence !== null) {
      await tx.runAsync('DELETE FROM sync_queue WHERE sequence = ?', decision.sequence);
    }
    if (entityType === 'expense') {
      await tx.runAsync('DELETE FROM expense_splits WHERE expense_id = ?', entityId);
      await tx.runAsync('DELETE FROM expenses WHERE id = ?', entityId);
    } else if (entityType === 'category') {
      await tx.runAsync('DELETE FROM ledger_categories WHERE id = ?', entityId);
    } else {
      await tx.runAsync('DELETE FROM recurring_expense_rules WHERE id = ?', entityId);
    }
    return;
  }

  if (decision.kind === 'update') {
    await tx.runAsync(
      `UPDATE sync_queue
       SET action = ?, payload = ?, base_updated_at = ?, status = 'queued', error = NULL,
           retry_count = 0, next_attempt_at = 0, updated_at = ?
       WHERE sequence = ?`,
      decision.action,
      JSON.stringify(payload),
      baseUpdatedAt,
      now,
      decision.sequence
    );
    return;
  }

  await tx.runAsync(
    `INSERT INTO sync_queue (
       entity_type, entity_id, ledger_id, action, payload, base_updated_at, status,
       error, retry_count, next_attempt_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'queued', NULL, 0, 0, ?, ?)`,
    entityType,
    entityId,
    ledgerId,
    decision.action,
    JSON.stringify(payload),
    baseUpdatedAt,
    now,
    now
  );
}

async function attachCachedSplits(expenses: ExpenseRow[]): Promise<Expense[]> {
  if (expenses.length === 0) {
    return [];
  }

  const db = await getLocalDb();
  const expenseIds = expenses.map((expense) => expense.id);
  const placeholders = expenseIds.map(() => '?').join(',');
  const splits = await db.getAllAsync<ExpenseSplitRow>(
    `SELECT * FROM expense_splits WHERE expense_id IN (${placeholders})`,
    expenseIds
  );
  const splitsByExpense = new Map<string, ExpenseSplitRow[]>();
  for (const split of splits) {
    const existing = splitsByExpense.get(split.expense_id) || [];
    existing.push(split);
    splitsByExpense.set(split.expense_id, existing);
  }

  return expenses.map((expense) => ({
    ...expense,
    splits: splitsByExpense.get(expense.id) || []
  }));
}

async function fetchProfiles(userIds: string[]): Promise<Record<string, Profile>> {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  if (uniqueIds.length === 0 || !online) {
    return {};
  }

  const { data, error } = await supabase.from('profiles').select('*').in('id', uniqueIds);
  if (error) {
    throw error;
  }
  return Object.fromEntries((data || []).map((profile) => [profile.id, profile as Profile]));
}

async function fetchSplits(expenseIds: string[]) {
  const { data, error } = await supabase
    .from('expense_splits')
    .select('*')
    .in('expense_id', expenseIds);
  if (error) {
    throw error;
  }
  return (data || []) as ExpenseSplitRow[];
}

async function upsertProfile(tx: LocalTransaction, profile: Profile) {
  await tx.runAsync(
    'INSERT OR REPLACE INTO profiles (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    profile.id,
    profile.display_name,
    profile.created_at,
    profile.updated_at
  );
}

async function upsertLedger(tx: LocalTransaction, ledger: Ledger) {
  await tx.runAsync(
    `INSERT OR REPLACE INTO ledgers (id, name, invite_code, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ledger.id,
    ledger.name,
    ledger.invite_code,
    ledger.created_by,
    ledger.created_at,
    ledger.updated_at
  );
}

async function upsertRemoteExpense(tx: LocalTransaction, expense: ExpenseRow, force = false) {
  const local = await tx.getFirstAsync<LocalExpenseRow>('SELECT * FROM expenses WHERE id = ?', expense.id);
  if (!force && local && local.local_status !== 'synced') {
    return;
  }
  const resolvedCategory = resolveCategory({
    categoryId: expense.category_id,
    category: expense.category,
    subcategory: expense.subcategory
  });

  await tx.runAsync(
    `INSERT OR REPLACE INTO expenses (
       id, ledger_id, amount_yen, category, category_id, subcategory, recurring_rule_id, recurring_month,
       paid_by, recorded_by, ownership, spent_on, note,
       created_at, updated_at, local_status, deleted_locally, base_updated_at, last_synced_updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', 0, NULL, ?)`,
    expense.id,
    expense.ledger_id,
    expense.amount_yen,
    expense.category || resolvedCategory.label,
    resolvedCategory.categoryId,
    resolvedCategory.subcategory,
    expense.recurring_rule_id,
    expense.recurring_month,
    expense.paid_by,
    expense.recorded_by,
    expense.ownership,
    expense.spent_on,
    expense.note,
    expense.created_at,
    expense.updated_at,
    expense.updated_at
  );
}

async function upsertRemoteCategory(tx: LocalTransaction, category: LedgerCategory, force = false) {
  const local = await tx.getFirstAsync<LocalCategoryRow>('SELECT * FROM ledger_categories WHERE id = ?', category.id);
  if (!force && local && local.local_status !== 'synced') {
    return;
  }
  const primaryCategoryId = category.category_id || mapLegacyCategoryToId(category.category_name);
  const primaryCategory = getPrimaryCategory(primaryCategoryId);

  await tx.runAsync(
    `INSERT OR REPLACE INTO ledger_categories (
       id, ledger_id, category_id, category_name, split_ratio_a, split_ratio_b, sort_order, created_at, updated_at,
       local_status, deleted_locally, base_updated_at, last_synced_updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', 0, NULL, ?)`,
    category.id,
    category.ledger_id,
    primaryCategory.id,
    category.category_name || primaryCategory.label,
    category.split_ratio_a,
    category.split_ratio_b,
    category.sort_order,
    category.created_at,
    category.updated_at,
    category.updated_at
  );
}

async function upsertRemoteRecurringRule(tx: LocalTransaction, rule: RecurringExpenseRule, force = false) {
  const local = await tx.getFirstAsync<LocalRecurringRuleRow>('SELECT * FROM recurring_expense_rules WHERE id = ?', rule.id);
  if (!force && local && local.local_status !== 'synced') {
    return;
  }
  const primaryCategory = getPrimaryCategory(rule.category_id);

  await tx.runAsync(
    `INSERT OR REPLACE INTO recurring_expense_rules (
       id, ledger_id, name, category_id, subcategory, amount_yen, paid_by, ownership, split_ratio_a, split_ratio_b,
       generate_day, start_month, end_month, timezone, is_active, created_by, created_at, updated_at,
       local_status, deleted_locally, base_updated_at, last_synced_updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', 0, NULL, ?)`,
    rule.id,
    rule.ledger_id,
    rule.name,
    primaryCategory.id,
    rule.subcategory,
    rule.amount_yen,
    rule.paid_by,
    rule.ownership,
    rule.split_ratio_a,
    rule.split_ratio_b,
    rule.generate_day,
    rule.start_month,
    rule.end_month,
    rule.timezone,
    rule.is_active ? 1 : 0,
    rule.created_by,
    rule.created_at,
    rule.updated_at,
    rule.updated_at
  );
}

async function markLocalEntityStatus(entityType: SyncEntityType, entityId: string, status: string) {
  const db = await getLocalDb();
  if (entityType === 'expense') {
    await db.runAsync('UPDATE expenses SET local_status = ? WHERE id = ?', status, entityId);
    return;
  }
  if (entityType === 'category') {
    await db.runAsync('UPDATE ledger_categories SET local_status = ? WHERE id = ?', status, entityId);
    return;
  }
  await db.runAsync('UPDATE recurring_expense_rules SET local_status = ? WHERE id = ?', status, entityId);
}

function mapLocalRecurringRule(row: LocalRecurringRuleRow): RecurringExpenseRule {
  return {
    id: row.id,
    ledger_id: row.ledger_id,
    name: row.name,
    category_id: row.category_id,
    subcategory: row.subcategory,
    amount_yen: row.amount_yen,
    paid_by: row.paid_by,
    ownership: row.ownership,
    split_ratio_a: row.split_ratio_a,
    split_ratio_b: row.split_ratio_b,
    generate_day: row.generate_day,
    start_month: row.start_month,
    end_month: row.end_month,
    timezone: row.timezone,
    is_active: Boolean(row.is_active),
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
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
