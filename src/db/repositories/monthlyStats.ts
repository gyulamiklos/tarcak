/**
 * Month-grouped reads for the Statistics screens (read-only). Every function answers for many
 * months in one query: the month bounds come from JS (`monthsCteSql`), so no SQL time-zone handling
 * is needed. Sums come back as text, because the driver's JS numbers are exact only up to 2^53.
 */

import { monthsCteSql, type FlowRow } from '../../domain/monthlyStats';
import type { ReportMonth } from '../../domain/monthlyReport';
import { openMainDatabase } from '../client';
import { scopeBalanceDeltaSql, scopeSql, type StatisticsScope } from './statistics';

/** Keeps the bound parameter count far below SQLite's limit; callers load at most this many months at once. */
export const MAX_MONTHS_PER_QUERY = 24;

function checkBatch(months: readonly ReportMonth[]): void {
  if (months.length > MAX_MONTHS_PER_QUERY) {
    throw new Error(`At most ${MAX_MONTHS_PER_QUERY} months per query.`);
  }
}

/** Income and expense sums of `currency` per month, kind, category and pocket. Transfers never count. */
export async function getMonthlyFlows(
  currency: string,
  scope: StatisticsScope,
  months: readonly ReportMonth[]
): Promise<FlowRow[]> {
  if (months.length === 0) return [];
  checkBatch(months);
  const cte = monthsCteSql(months);
  const scoped = scopeSql(scope);
  const db = await openMainDatabase();
  const rows = await db.getAllAsync<{
    month: string;
    kind: 'income' | 'expense';
    category_id: string | null;
    category_name: string | null;
    category_color: string | null;
    pocket_id: string;
    pocket_name: string | null;
    total: string;
  }>(
    `${cte.sql}
     SELECT m.month_key AS month, t.kind AS kind, t.category_id AS category_id,
            c.name AS category_name, c.color AS category_color,
            t.pocket_id AS pocket_id, p.name AS pocket_name,
            CAST(SUM(t.amount_minor) AS TEXT) AS total
     FROM m
     JOIN transactions t ON t.occurred_at >= m.from_ms AND t.occurred_at < m.to_ms
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN pockets p ON p.id = t.pocket_id
     WHERE t.currency = ? AND t.kind IN ('income', 'expense') ${scoped.sql}
     GROUP BY m.month_key, t.kind, t.category_id, t.pocket_id`,
    [...cte.params, currency, ...scoped.params]
  );
  return rows.map((r) => ({
    month: r.month,
    kind: r.kind,
    categoryId: r.category_id,
    categoryName: r.category_name,
    categoryColor: r.category_color,
    pocketId: r.pocket_id,
    pocketName: r.pocket_name ?? 'Unknown',
    total: BigInt(r.total),
  }));
}

/**
 * The balance change of `scope` in `currency` per month, transfers included. The first month's lower
 * bound is open, so its change also holds everything before it; `cumulativeBalances` turns the result
 * into month-end balances. Months without a change are missing from the map.
 */
export async function getMonthBalanceDeltas(
  currency: string,
  scope: StatisticsScope,
  months: readonly ReportMonth[]
): Promise<Map<string, bigint>> {
  if (months.length === 0) return new Map();
  checkBatch(months);
  const cte = monthsCteSql(months, { openStart: true });
  const delta = scopeBalanceDeltaSql(scope);
  const db = await openMainDatabase();
  const rows = await db.getAllAsync<{ month: string; delta: string }>(
    `${cte.sql}
     SELECT m.month_key AS month, CAST(SUM(${delta.sql}) AS TEXT) AS delta
     FROM m
     JOIN transactions t ON t.occurred_at >= m.from_ms AND t.occurred_at < m.to_ms
     WHERE t.currency = ?
     GROUP BY m.month_key`,
    [...cte.params, ...delta.params, currency]
  );
  return new Map(rows.map((r) => [r.month, BigInt(r.delta)]));
}

/**
 * When the first transaction that changed the balance of `scope` in `currency` happened, or null if
 * none did. A transfer counts where it moves money in or out of the scope, so a pocket funded only
 * by transfers starts with its first transfer; months before this one have nothing to show.
 */
export async function getFirstActivityAt(currency: string, scope: StatisticsScope): Promise<number | null> {
  const delta = scopeBalanceDeltaSql(scope);
  const db = await openMainDatabase();
  const r = await db.getFirstAsync<{ m: number | null }>(
    `SELECT MIN(occurred_at) AS m FROM transactions
     WHERE currency = ? AND (${delta.sql}) != 0`,
    [currency, ...delta.params]
  );
  return r?.m ?? null;
}
