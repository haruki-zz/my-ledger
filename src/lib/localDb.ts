import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

const DATABASE_NAME = 'my-ledger-offline.db';
const SCHEMA_VERSION = 5;
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
