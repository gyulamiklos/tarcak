/**
 * Time-series and allocation stats derived from the ledger (read-only).
 */

import { openMainDatabase } from '../client';

export type StatisticsScope =
  | { mode: 'all' }
  | { mode: 'pocket'; pocketId: string }
  | { mode: 'exclude_jar'; jarId: string };

export type BalanceTimelinePoint = {
  /** Unix ms */
  at: number;
  balance_minor: number;
};

type TxRow = {
  kind: string;
  amount_minor: number;
  occurred_at: number;
  pocket_id: string | null;
  from_pocket_id: string | null;
  to_pocket_id: string | null;
};

function deltaForScope(row: TxRow, scope: StatisticsScope): number {
  if (scope.mode === 'all') {
    if (row.kind === 'income') return row.amount_minor;
    if (row.kind === 'expense') return -row.amount_minor;
    return 0;
  }
  if (scope.mode === 'pocket') {
    const p = scope.pocketId;
    if (row.kind === 'income' && row.pocket_id === p) return row.amount_minor;
    if (row.kind === 'expense' && row.pocket_id === p) return -row.amount_minor;
    if (row.kind === 'transfer') {
      let d = 0;
      if (row.from_pocket_id === p) d -= row.amount_minor;
      if (row.to_pocket_id === p) d += row.amount_minor;
      return d;
    }
    return 0;
  }
  const j = scope.jarId;
  if (row.kind === 'income' && row.pocket_id && row.pocket_id !== j) return row.amount_minor;
  if (row.kind === 'expense' && row.pocket_id && row.pocket_id !== j) return -row.amount_minor;
  if (row.kind === 'transfer') {
    let d = 0;
    if (row.from_pocket_id !== j) d -= row.amount_minor;
    if (row.to_pocket_id !== j) d += row.amount_minor;
    return d;
  }
  return 0;
}

/**
 * The signed balance change of one `transactions` row for `scope`, as a SQL expression: income and
 * expense move the balance of their pocket; a transfer adds where its target is inside the scope and
 * subtracts where its source is, independently, so a transfer with both sides inside nets to zero
 * (a single CASE would stop at the first matching side and count it as money leaving).
 */
export function scopeBalanceDeltaSql(scope: StatisticsScope): { sql: string; params: string[] } {
  if (scope.mode === 'all') {
    return {
      sql: `CASE kind
          WHEN 'income' THEN amount_minor
          WHEN 'expense' THEN -amount_minor
          ELSE 0
        END`,
      params: [],
    };
  }
  if (scope.mode === 'pocket') {
    const p = scope.pocketId;
    return {
      sql: `CASE
          WHEN kind = 'income' AND pocket_id = ? THEN amount_minor
          WHEN kind = 'expense' AND pocket_id = ? THEN -amount_minor
          WHEN kind = 'transfer' THEN
            (CASE WHEN to_pocket_id = ? THEN amount_minor ELSE 0 END)
            - (CASE WHEN from_pocket_id = ? THEN amount_minor ELSE 0 END)
          ELSE 0
        END`,
      params: [p, p, p, p],
    };
  }
  const j = scope.jarId;
  return {
    sql: `CASE
        WHEN kind = 'income' AND pocket_id IS NOT NULL AND pocket_id != ? THEN amount_minor
        WHEN kind = 'expense' AND pocket_id IS NOT NULL AND pocket_id != ? THEN -amount_minor
        WHEN kind = 'transfer' THEN
          (CASE WHEN to_pocket_id != ? THEN amount_minor ELSE 0 END)
          - (CASE WHEN from_pocket_id != ? THEN amount_minor ELSE 0 END)
        ELSE 0
      END`,
    params: [j, j, j, j],
  };
}

async function baselineMinorBefore(currency: string, scope: StatisticsScope, beforeMs: number): Promise<number> {
  const db = await openMainDatabase();
  const delta = scopeBalanceDeltaSql(scope);
  const r = await db.getFirstAsync<{ b: number }>(
    `SELECT COALESCE(SUM(${delta.sql}), 0) AS b
    FROM transactions WHERE currency = ? AND occurred_at < ?`,
    [...delta.params, currency, beforeMs]
  );
  return r?.b ?? 0;
}

/**
 * Running balance for `currency` within [startMs, endMs] for the given scope.
 * Points include the balance at startMs (before any tx exactly at startMs, baseline uses occurred_at < startMs),
 * then after each relevant transaction, and a final point at endMs if needed.
 */
export async function getBalanceTimeline(
  currency: string,
  scope: StatisticsScope,
  startMs: number,
  endMs: number
): Promise<BalanceTimelinePoint[]> {
  const db = await openMainDatabase();
  const rows = await db.getAllAsync<TxRow>(
    `SELECT kind, amount_minor, occurred_at, pocket_id, from_pocket_id, to_pocket_id
     FROM transactions
     WHERE currency = ? AND occurred_at >= ? AND occurred_at <= ?
     ORDER BY occurred_at ASC, id ASC`,
    [currency, startMs, endMs]
  );

  let running = await baselineMinorBefore(currency, scope, startMs);
  const points: BalanceTimelinePoint[] = [{ at: startMs, balance_minor: running }];

  for (const row of rows) {
    const d = deltaForScope(row, scope);
    if (d === 0) continue;
    running += d;
    const last = points[points.length - 1];
    if (last.at === row.occurred_at) {
      last.balance_minor = running;
    } else {
      points.push({ at: row.occurred_at, balance_minor: running });
    }
  }

  const lastPt = points[points.length - 1];
  if (lastPt.at < endMs) {
    points.push({ at: endMs, balance_minor: running });
  }

  return points;
}

export function downsampleTimeline(
  points: BalanceTimelinePoint[],
  maxPoints: number
): BalanceTimelinePoint[] {
  if (points.length <= maxPoints) return points;
  const out: BalanceTimelinePoint[] = [];
  const n = points.length;
  const step = (n - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    const idx = i === maxPoints - 1 ? n - 1 : Math.round(i * step);
    out.push(points[Math.min(idx, n - 1)]);
  }
  const deduped: BalanceTimelinePoint[] = [];
  for (const p of out) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.at === p.at && prev.balance_minor === p.balance_minor) continue;
    deduped.push(p);
  }
  return deduped.length >= 2 ? deduped : out;
}

/** Pocket restriction for income/expense queries over `transactions t` (transfers are filtered out by `kind`). */
export function scopeSql(scope: StatisticsScope): { sql: string; params: string[] } {
  if (scope.mode === 'pocket') {
    return { sql: 'AND t.pocket_id = ?', params: [scope.pocketId] };
  }
  if (scope.mode === 'exclude_jar') {
    return { sql: 'AND t.pocket_id != ?', params: [scope.jarId] };
  }
  return { sql: '', params: [] };
}

export async function getEarliestOccurredAt(): Promise<number | null> {
  const db = await openMainDatabase();
  const r = await db.getFirstAsync<{ m: number }>(
    `SELECT MIN(occurred_at) AS m FROM transactions`
  );
  if (r?.m == null) return null;
  return r.m;
}
