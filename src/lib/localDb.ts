import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'my-ledger-offline.db';
const SCHEMA_VERSION = 1;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Async mutex: serializes all withLocalTransaction calls so that
// only one BEGIN…COMMIT runs at a time on the single db connection.
let txQueue: Promise<void> = Promise.resolve();

export async function getLocalDb() {
  if (!databasePromise) {
    databasePromise = openAndMigrate();
  }

  return databasePromise;
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
          category TEXT NOT NULL,
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
          category_name TEXT NOT NULL,
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

        CREATE TABLE IF NOT EXISTS transfer_checklist_snapshot (
          expense_id TEXT PRIMARY KEY NOT NULL,
          ledger_id TEXT NOT NULL,
          category TEXT NOT NULL,
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
        ON ledger_categories(ledger_id, sort_order, category_name);

        CREATE INDEX IF NOT EXISTS sync_queue_status_idx
        ON sync_queue(status, next_attempt_at, sequence);
      `);
    }

    await db.runAsync(
      'INSERT OR REPLACE INTO local_meta (key, value) VALUES (?, ?)',
      'schema_version',
      String(SCHEMA_VERSION)
    );
  });
}

export async function clearLocalBusinessData() {
  await withLocalTransaction(async () => {
    const db = await getLocalDb();
    await db.execAsync(`
      DELETE FROM sync_dedupe;
      DELETE FROM sync_queue;
      DELETE FROM transfer_checklist_snapshot;
      DELETE FROM ledger_categories;
      DELETE FROM expense_splits;
      DELETE FROM expenses;
      DELETE FROM ledger_members;
      DELETE FROM ledgers;
      DELETE FROM profiles;
    `);
  });
}
