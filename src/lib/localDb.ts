import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

const DATABASE_NAME = 'my-ledger-offline.db';
const SCHEMA_VERSION = 6;
const WEB_DATABASE_OPEN_TIMEOUT_MS = 2500;
const LOCAL_DB_OPEN_TIMEOUT = Symbol('local-db-open-timeout');

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let localDbUnavailableError: LocalDbUnavailableError | null = null;

// Async mutex: serializes all withLocalTransaction calls so that
// only one BEGIN…COMMIT runs at a time on the single db connection.
let txQueue: Promise<void> = Promise.resolve();

class LocalDbUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalDbUnavailableError';
  }
}

export function isLocalDbUnavailableError(error: unknown) {
  return error instanceof LocalDbUnavailableError;
}

export async function getLocalDb() {
  if (localDbUnavailableError) {
    throw localDbUnavailableError;
  }

  if (!databasePromise) {
    databasePromise = withOpenTimeout(openAndMigrate()).catch((error) => {
      databasePromise = null;
      // A timed-out web SQLite open is treated as a session-level capability failure
      // so callers can immediately use the remote fallback. Other open errors are
      // left retryable by clearing only the in-flight promise.
      if (isLocalDbUnavailableError(error)) {
        localDbUnavailableError = error;
      }
      throw error;
    });
  }

  return databasePromise;
}

export async function retryLocalDbOpen() {
  localDbUnavailableError = null;
  databasePromise = null;
  return getLocalDb();
}

/**
 * Run `fn` inside a SQLite transaction, serialized so that concurrent
 * callers queue up instead of hitting "cannot start a transaction within
 * a transaction".  Use `db` (from `getLocalDb()`) for all reads/writes
 * inside the callback — they are automatically scoped to the transaction.
 */
export async function withLocalTransaction(fn: () => Promise<void>): Promise<void> {
  const db = await getLocalDb();

  // Chain after whatever is currently in the queue.
  // Each link resolves only after its transaction finishes (success or error),
  // so the next link never sees an open transaction.
  let release: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const previous = txQueue;
  txQueue = gate;

  await previous; // wait for the preceding transaction to finish
  try {
    await db.withTransactionAsync(fn);
  } finally {
    release!();
  }
}

async function openAndMigrate() {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME, { enableChangeListener: false });
  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
  `);
  await migrateLocalDb(db);
  return db;
}

async function withOpenTimeout<T>(promise: Promise<T>): Promise<T> {
  if (Platform.OS !== 'web') {
    return promise;
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<typeof LOCAL_DB_OPEN_TIMEOUT>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve(LOCAL_DB_OPEN_TIMEOUT);
    }, WEB_DATABASE_OPEN_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    if (result === LOCAL_DB_OPEN_TIMEOUT) {
      throw new LocalDbUnavailableError('Local database is unavailable in this browser session');
    }
    return result;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function migrateLocalDb(db: SQLite.SQLiteDatabase) {
  // Migration runs during init — no other code can reach the db yet,
  // so a plain withTransactionAsync is safe here.
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS local_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);

    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM local_meta WHERE key = ?',
      'schema_version'
    );
    const currentVersion = row ? Number(row.value) : 0;

    if (currentVersion > SCHEMA_VERSION) {
      throw new Error('Local database version is newer than this app version');
    }

    if (currentVersion < 1) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY NOT NULL,
          display_name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ledgers (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          invite_code TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ledger_members (
          ledger_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          joined_at TEXT NOT NULL,
          PRIMARY KEY (ledger_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS expenses (
          id TEXT PRIMARY KEY NOT NULL,
          ledger_id TEXT NOT NULL,
          amount_yen INTEGER NOT NULL,
          category TEXT,
          category_id TEXT,
          subcategory TEXT,
          recurring_rule_id TEXT,
          recurring_month TEXT,
          paid_by TEXT NOT NULL,
          recorded_by TEXT NOT NULL,
          ownership TEXT NOT NULL,
          spent_on TEXT NOT NULL,
          note TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          local_status TEXT NOT NULL DEFAULT 'synced',
          deleted_locally INTEGER NOT NULL DEFAULT 0,
          base_updated_at TEXT,
          last_synced_updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS expense_splits (
          expense_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          amount_yen INTEGER NOT NULL,
          PRIMARY KEY (expense_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS ledger_categories (
          id TEXT PRIMARY KEY NOT NULL,
          ledger_id TEXT NOT NULL,
          category_id TEXT,
          category_name TEXT,
          split_ratio_a INTEGER NOT NULL,
          split_ratio_b INTEGER NOT NULL,
          sort_order INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          local_status TEXT NOT NULL DEFAULT 'synced',
          deleted_locally INTEGER NOT NULL DEFAULT 0,
          base_updated_at TEXT,
          last_synced_updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS recurring_expense_rules (
          id TEXT PRIMARY KEY NOT NULL,
          ledger_id TEXT NOT NULL,
          name TEXT NOT NULL,
          category_id TEXT NOT NULL,
          subcategory TEXT,
          amount_yen INTEGER NOT NULL,
          paid_by TEXT NOT NULL,
          ownership TEXT NOT NULL DEFAULT 'shared',
          split_ratio_a INTEGER NOT NULL,
          split_ratio_b INTEGER NOT NULL,
          split_amount_a INTEGER,
          split_amount_b INTEGER,
          generate_day INTEGER NOT NULL,
          start_month TEXT NOT NULL,
          end_month TEXT,
          timezone TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          local_status TEXT NOT NULL DEFAULT 'synced',
          deleted_locally INTEGER NOT NULL DEFAULT 0,
          base_updated_at TEXT,
          last_synced_updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS transfer_checklist_snapshot (
          expense_id TEXT PRIMARY KEY NOT NULL,
          ledger_id TEXT NOT NULL,
          category TEXT NOT NULL,
          category_id TEXT,
          subcategory TEXT,
          spent_on TEXT NOT NULL,
          expense_created_at TEXT NOT NULL,
          expense_updated_at TEXT NOT NULL,
          payer_user_id TEXT NOT NULL,
          payee_user_id TEXT NOT NULL,
          amount_yen INTEGER NOT NULL,
          payer_completed_at TEXT,
          payee_completed_at TEXT,
          cached_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_queue (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          ledger_id TEXT NOT NULL,
          action TEXT NOT NULL,
          payload TEXT NOT NULL,
          base_updated_at TEXT,
          status TEXT NOT NULL,
          error TEXT,
          retry_count INTEGER NOT NULL DEFAULT 0,
          next_attempt_at INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS sync_queue_active_entity_idx
        ON sync_queue(entity_type, entity_id)
        WHERE status IN ('queued', 'syncing', 'failed', 'conflict');

        CREATE TABLE IF NOT EXISTS sync_dedupe (
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (entity_type, entity_id)
        );

        CREATE INDEX IF NOT EXISTS expenses_ledger_date_idx
        ON expenses(ledger_id, spent_on DESC, created_at DESC);

        CREATE INDEX IF NOT EXISTS ledger_categories_sort_idx
        ON ledger_categories(ledger_id, sort_order, category_id);

        CREATE INDEX IF NOT EXISTS recurring_expense_rules_ledger_idx
        ON recurring_expense_rules(ledger_id, is_active, category_id, subcategory);

        CREATE INDEX IF NOT EXISTS sync_queue_status_idx
        ON sync_queue(status, next_attempt_at, sequence);
      `);
    }

    if (currentVersion >= 1 && currentVersion < 2) {
      await addColumnIfMissing(db, 'expenses', 'category_id', 'TEXT');
      await addColumnIfMissing(db, 'expenses', 'subcategory', 'TEXT');
      await addColumnIfMissing(db, 'ledger_categories', 'category_id', 'TEXT');
      await addColumnIfMissing(db, 'transfer_checklist_snapshot', 'category_id', 'TEXT');
      await addColumnIfMissing(db, 'transfer_checklist_snapshot', 'subcategory', 'TEXT');

      await db.execAsync(`
        UPDATE expenses
        SET category_id = CASE lower(trim(category))
          WHEN 'rent' THEN 'housing'
          WHEN '房租' THEN 'housing'
          WHEN 'food & dining' THEN 'food_dining'
          WHEN '餐饮' THEN 'food_dining'
          WHEN 'household' THEN 'household'
          WHEN '日用品' THEN 'household'
          WHEN 'transport' THEN 'transport'
          WHEN '交通' THEN 'transport'
          WHEN 'utilities' THEN 'utilities'
          WHEN '水电燃气' THEN 'utilities'
          WHEN 'communications' THEN 'communications'
          WHEN '通信' THEN 'communications'
          WHEN 'healthcare' THEN 'healthcare'
          WHEN '医疗' THEN 'healthcare'
          WHEN 'entertainment' THEN 'entertainment'
          WHEN '娱乐' THEN 'entertainment'
          WHEN 'shopping' THEN 'shopping'
          WHEN '购物' THEN 'shopping'
          WHEN 'travel' THEN 'travel'
          WHEN '旅行' THEN 'travel'
          WHEN 'other' THEN 'other'
          WHEN '其他' THEN 'other'
          ELSE 'other'
        END
        WHERE category_id IS NULL;

        UPDATE expenses
        SET subcategory = trim(category)
        WHERE subcategory IS NULL
          AND category IS NOT NULL
          AND trim(category) <> ''
          AND lower(trim(category)) NOT IN (
            'food & dining', '餐饮', 'household', '日用品', 'transport', '交通',
            'utilities', '水电燃气', 'communications', '通信', 'healthcare', '医疗',
            'entertainment', '娱乐', 'shopping', '购物', 'travel', '旅行',
            'other', '其他'
          );

        UPDATE ledger_categories
        SET category_id = CASE lower(trim(category_name))
          WHEN 'rent' THEN 'housing'
          WHEN '房租' THEN 'housing'
          WHEN 'food & dining' THEN 'food_dining'
          WHEN '餐饮' THEN 'food_dining'
          WHEN 'household' THEN 'household'
          WHEN '日用品' THEN 'household'
          WHEN 'transport' THEN 'transport'
          WHEN '交通' THEN 'transport'
          WHEN 'utilities' THEN 'utilities'
          WHEN '水电燃气' THEN 'utilities'
          WHEN 'communications' THEN 'communications'
          WHEN '通信' THEN 'communications'
          WHEN 'healthcare' THEN 'healthcare'
          WHEN '医疗' THEN 'healthcare'
          WHEN 'entertainment' THEN 'entertainment'
          WHEN '娱乐' THEN 'entertainment'
          WHEN 'shopping' THEN 'shopping'
          WHEN '购物' THEN 'shopping'
          WHEN 'travel' THEN 'travel'
          WHEN '旅行' THEN 'travel'
          WHEN 'other' THEN 'other'
          WHEN '其他' THEN 'other'
          ELSE 'other'
        END
        WHERE category_id IS NULL;

        CREATE INDEX IF NOT EXISTS ledger_categories_sort_idx_v2
        ON ledger_categories(ledger_id, sort_order, category_id);
      `);
    }

    if (currentVersion > 0 && currentVersion < 3) {
      await addColumnIfMissing(db, 'expenses', 'recurring_rule_id', 'TEXT');
      await addColumnIfMissing(db, 'expenses', 'recurring_month', 'TEXT');

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS recurring_expense_rules (
          id TEXT PRIMARY KEY NOT NULL,
          ledger_id TEXT NOT NULL,
          name TEXT NOT NULL,
          category_id TEXT NOT NULL,
          subcategory TEXT,
          amount_yen INTEGER NOT NULL,
          paid_by TEXT NOT NULL,
          ownership TEXT NOT NULL DEFAULT 'shared',
          split_ratio_a INTEGER NOT NULL,
          split_ratio_b INTEGER NOT NULL,
          split_amount_a INTEGER,
          split_amount_b INTEGER,
          generate_day INTEGER NOT NULL,
          start_month TEXT NOT NULL,
          end_month TEXT,
          timezone TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          local_status TEXT NOT NULL DEFAULT 'synced',
          deleted_locally INTEGER NOT NULL DEFAULT 0,
          base_updated_at TEXT,
          last_synced_updated_at TEXT
        );

        CREATE INDEX IF NOT EXISTS recurring_expense_rules_ledger_idx
        ON recurring_expense_rules(ledger_id, is_active, category_id, subcategory);
      `);
    }

    if (currentVersion > 0 && currentVersion < 4) {
      await addColumnIfMissing(
        db,
        'recurring_expense_rules',
        'ownership',
        "TEXT NOT NULL DEFAULT 'shared'"
      );
    }

    if (currentVersion > 0 && currentVersion < 5) {
      await addColumnIfMissing(db, 'recurring_expense_rules', 'split_amount_a', 'INTEGER');
      await addColumnIfMissing(db, 'recurring_expense_rules', 'split_amount_b', 'INTEGER');
      await db.execAsync(`
        UPDATE recurring_expense_rules
        SET split_amount_a = ROUND(amount_yen * split_ratio_a / 100.0),
            split_amount_b = amount_yen - ROUND(amount_yen * split_ratio_a / 100.0)
        WHERE ownership = 'shared'
          AND split_amount_a IS NULL
          AND split_amount_b IS NULL;
      `);
    }

    if (currentVersion < 6) {
      const pendingLegacyQueue = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM sync_queue
         WHERE status IN ('queued', 'syncing', 'failed', 'conflict')
           AND entity_type IN ('expense', 'category', 'recurring_rule')`
      );

      if ((pendingLegacyQueue?.count || 0) > 0) {
        throw new Error(
          'Local migration blocked: please go online and sync pending offline changes before updating to the transaction schema.'
        );
      }

      await addColumnIfMissing(db, 'ledgers', 'owner_id', 'TEXT');
      await addColumnIfMissing(db, 'ledger_members', 'status', "TEXT NOT NULL DEFAULT 'active'");
      await addColumnIfMissing(db, 'ledger_members', 'left_at', 'TEXT');
      await addColumnIfMissing(db, 'ledger_members', 'created_at', 'TEXT');
      await addColumnIfMissing(db, 'ledger_members', 'updated_at', 'TEXT');

      await db.execAsync(`
        UPDATE ledgers
        SET owner_id = created_by
        WHERE owner_id IS NULL;

        UPDATE ledger_members
        SET status = COALESCE(status, 'active'),
            left_at = NULL,
            created_at = COALESCE(created_at, joined_at),
            updated_at = COALESCE(updated_at, joined_at);

        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY NOT NULL,
          type TEXT NOT NULL,
          parent_id TEXT,
          display_name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY NOT NULL,
          ledger_id TEXT NOT NULL,
          type TEXT NOT NULL,
          amount_yen INTEGER NOT NULL,
          category_id TEXT NOT NULL,
          occurred_on TEXT NOT NULL,
          note TEXT,
          paid_by_member_id TEXT,
          ownership TEXT,
          owned_by_member_id TEXT,
          recorded_by_member_id TEXT NOT NULL,
          recurring_rule_id TEXT,
          recurring_month TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          local_status TEXT NOT NULL DEFAULT 'synced',
          deleted_locally INTEGER NOT NULL DEFAULT 0,
          base_updated_at TEXT,
          last_synced_updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS transaction_splits (
          transaction_id TEXT NOT NULL,
          responsible_member_id TEXT NOT NULL,
          amount_yen INTEGER NOT NULL,
          PRIMARY KEY (transaction_id, responsible_member_id)
        );

        CREATE TABLE IF NOT EXISTS recurring_transaction_rules (
          id TEXT PRIMARY KEY NOT NULL,
          ledger_id TEXT NOT NULL,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          amount_yen INTEGER NOT NULL,
          category_id TEXT NOT NULL,
          generate_day INTEGER NOT NULL,
          start_month TEXT NOT NULL,
          end_month TEXT,
          timezone TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          paid_by_member_id TEXT,
          ownership TEXT,
          owned_by_member_id TEXT,
          created_by_member_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          local_status TEXT NOT NULL DEFAULT 'synced',
          deleted_locally INTEGER NOT NULL DEFAULT 0,
          base_updated_at TEXT,
          last_synced_updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS recurring_rule_splits (
          rule_id TEXT NOT NULL,
          responsible_member_id TEXT NOT NULL,
          amount_yen INTEGER NOT NULL,
          PRIMARY KEY (rule_id, responsible_member_id)
        );

        CREATE TABLE IF NOT EXISTS budget_templates (
          id TEXT PRIMARY KEY NOT NULL,
          ledger_id TEXT NOT NULL,
          member_id TEXT NOT NULL,
          scope TEXT NOT NULL,
          category_id TEXT,
          amount_yen INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          local_status TEXT NOT NULL DEFAULT 'synced',
          deleted_locally INTEGER NOT NULL DEFAULT 0,
          base_updated_at TEXT,
          last_synced_updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS budget_monthly_snapshots (
          id TEXT PRIMARY KEY NOT NULL,
          ledger_id TEXT NOT NULL,
          member_id TEXT NOT NULL,
          month TEXT NOT NULL,
          scope TEXT NOT NULL,
          category_id TEXT,
          amount_yen INTEGER NOT NULL,
          source TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          local_status TEXT NOT NULL DEFAULT 'synced',
          deleted_locally INTEGER NOT NULL DEFAULT 0,
          base_updated_at TEXT,
          last_synced_updated_at TEXT
        );

        INSERT OR REPLACE INTO categories (id, type, parent_id, display_name, sort_order, is_active, created_at, updated_at)
        VALUES
          ('food_dining', 'expense', NULL, 'Food & Dining', 10, 1, datetime('now'), datetime('now')),
          ('household', 'expense', NULL, 'Household', 20, 1, datetime('now'), datetime('now')),
          ('transport', 'expense', NULL, 'Transport', 30, 1, datetime('now'), datetime('now')),
          ('housing', 'expense', NULL, 'Housing', 40, 1, datetime('now'), datetime('now')),
          ('utilities', 'expense', NULL, 'Utilities', 50, 1, datetime('now'), datetime('now')),
          ('communications', 'expense', NULL, 'Communications', 60, 1, datetime('now'), datetime('now')),
          ('healthcare', 'expense', NULL, 'Healthcare', 70, 1, datetime('now'), datetime('now')),
          ('entertainment', 'expense', NULL, 'Entertainment', 80, 1, datetime('now'), datetime('now')),
          ('shopping', 'expense', NULL, 'Shopping', 90, 1, datetime('now'), datetime('now')),
          ('travel', 'expense', NULL, 'Travel', 100, 1, datetime('now'), datetime('now')),
          ('other', 'expense', NULL, 'Other', 110, 1, datetime('now'), datetime('now')),
          ('salary', 'income', NULL, 'Salary', 10, 1, datetime('now'), datetime('now')),
          ('bonus', 'income', NULL, 'Bonus', 20, 1, datetime('now'), datetime('now')),
          ('investment_income', 'income', NULL, 'Investment Income', 30, 1, datetime('now'), datetime('now')),
          ('gift_income', 'income', NULL, 'Gift', 40, 1, datetime('now'), datetime('now')),
          ('other_income', 'income', NULL, 'Other Income', 90, 1, datetime('now'), datetime('now'));

        INSERT OR REPLACE INTO transactions (
          id, ledger_id, type, amount_yen, category_id, occurred_on, note,
          paid_by_member_id, ownership, owned_by_member_id, recorded_by_member_id,
          recurring_rule_id, recurring_month, created_at, updated_at,
          local_status, deleted_locally, base_updated_at, last_synced_updated_at
        )
        SELECT
          id, ledger_id, 'expense', amount_yen, COALESCE(category_id, 'other'), spent_on, note,
          paid_by, ownership, NULL, recorded_by,
          recurring_rule_id, recurring_month, created_at, updated_at,
          local_status, deleted_locally, base_updated_at, last_synced_updated_at
        FROM expenses
        WHERE deleted_locally = 0;

        INSERT OR REPLACE INTO transaction_splits (transaction_id, responsible_member_id, amount_yen)
        SELECT expense_id, user_id, amount_yen
        FROM expense_splits;

        INSERT OR REPLACE INTO recurring_transaction_rules (
          id, ledger_id, type, name, amount_yen, category_id, generate_day,
          start_month, end_month, timezone, is_active,
          paid_by_member_id, ownership, owned_by_member_id, created_by_member_id,
          created_at, updated_at, local_status, deleted_locally, base_updated_at, last_synced_updated_at
        )
        SELECT
          id, ledger_id, 'expense', name, amount_yen, category_id, generate_day,
          start_month, end_month, timezone, is_active,
          paid_by, ownership, NULL, created_by,
          created_at, updated_at, local_status, deleted_locally, base_updated_at, last_synced_updated_at
        FROM recurring_expense_rules
        WHERE deleted_locally = 0;

        CREATE INDEX IF NOT EXISTS transactions_ledger_date_idx
        ON transactions(ledger_id, occurred_on DESC, created_at DESC);

        CREATE INDEX IF NOT EXISTS transactions_type_date_idx
        ON transactions(ledger_id, type, occurred_on DESC);

        CREATE INDEX IF NOT EXISTS transaction_splits_member_idx
        ON transaction_splits(responsible_member_id);

        CREATE INDEX IF NOT EXISTS recurring_transaction_rules_ledger_idx
        ON recurring_transaction_rules(ledger_id, is_active, type, category_id);

        CREATE INDEX IF NOT EXISTS budget_templates_ledger_member_idx
        ON budget_templates(ledger_id, member_id, scope, category_id);

        CREATE INDEX IF NOT EXISTS budget_monthly_snapshots_ledger_month_idx
        ON budget_monthly_snapshots(ledger_id, month, member_id, scope, category_id);
      `);
    }

    await db.runAsync(
      'INSERT OR REPLACE INTO local_meta (key, value) VALUES (?, ?)',
      'schema_version',
      String(SCHEMA_VERSION)
    );
  });
}

async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  columnName: string,
  columnDefinition: string
) {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
}

export async function clearLocalBusinessData() {
  try {
    await withLocalTransaction(async () => {
      const db = await getLocalDb();
      await db.execAsync(`
        DELETE FROM sync_dedupe;
        DELETE FROM sync_queue;
        DELETE FROM transfer_checklist_snapshot;
        DELETE FROM budget_monthly_snapshots;
        DELETE FROM budget_templates;
        DELETE FROM recurring_rule_splits;
        DELETE FROM recurring_transaction_rules;
        DELETE FROM transaction_splits;
        DELETE FROM transactions;
        DELETE FROM categories;
        DELETE FROM recurring_expense_rules;
        DELETE FROM ledger_categories;
        DELETE FROM expense_splits;
        DELETE FROM expenses;
        DELETE FROM ledger_members;
        DELETE FROM ledgers;
        DELETE FROM profiles;
      `);
    });
  } catch (error) {
    if (!isLocalDbUnavailableError(error)) {
      throw error;
    }
  }
}
