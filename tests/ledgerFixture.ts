/** In-memory ledger for repository tests (see `tests/stubs/dbClient.ts`). */
import { testDb } from './stubs/dbClient';

/** The columns the statistics queries read; constraints live in the real migrations. */
export function createLedgerTables(): void {
  testDb.exec(`
    DROP TABLE IF EXISTS transactions;
    DROP TABLE IF EXISTS pockets;
    DROP TABLE IF EXISTS categories;
    CREATE TABLE pockets (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT);
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, amount_minor INTEGER NOT NULL, currency TEXT NOT NULL,
      occurred_at INTEGER NOT NULL, pocket_id TEXT, from_pocket_id TEXT, to_pocket_id TEXT, category_id TEXT,
      title TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO pockets VALUES ('jar', 'Jar'), ('p1', 'Wallet'), ('p2', 'Bank');
  `);
}

let seq = 0;
export function addTx(tx: {
  kind: 'income' | 'expense' | 'transfer';
  amount: number;
  at: number;
  currency?: string;
  pocket?: string;
  from?: string;
  to?: string;
  category?: string;
}): void {
  testDb
    .prepare(
      `INSERT INTO transactions
         (id, kind, amount_minor, currency, occurred_at, pocket_id, from_pocket_id, to_pocket_id, category_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      `t${++seq}`,
      tx.kind,
      tx.amount,
      tx.currency ?? 'HUF',
      tx.at,
      tx.pocket ?? null,
      tx.from ?? null,
      tx.to ?? null,
      tx.category ?? null
    );
}
