/**
 * Node stand-in for `src/db/client.ts` (tests only): repositories run their real SQL against an
 * in-memory `node:sqlite` database. Tests create the tables they need through `testDb`.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export const testDb = new DatabaseSync(':memory:');

const db = {
  async getAllAsync<T>(sql: string, params: SQLInputValue[] = []): Promise<T[]> {
    return testDb.prepare(sql).all(...params) as T[];
  },
  async getFirstAsync<T>(sql: string, params: SQLInputValue[] = []): Promise<T | null> {
    return (testDb.prepare(sql).get(...params) as T | undefined) ?? null;
  },
};

export async function openMainDatabase(): Promise<typeof db> {
  return db;
}
