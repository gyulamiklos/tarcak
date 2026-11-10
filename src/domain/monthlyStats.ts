/**
 * Month-based statistics: monthly income/expense sums, the 12-month average, the breakdown of one
 * month by category or pocket, month-end balances and the bar chart scale. Pure logic (no React
 * Native or database imports) so the Node test runner covers it; the repository supplies grouped
 * sums. Amounts are BigInt end to end; `number` appears only in `chartScale`, which sizes drawn bars.
 */

import { monthKey, monthRangeFor, type ReportKind, type ReportMonth } from './monthlyReport';

/** One grouped sum from the ledger: month × kind × category × pocket (transfers never appear). */
export type FlowRow = {
  /** `YYYY-MM` */
  month: string;
  kind: ReportKind;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  pocketId: string;
  pocketName: string;
  /** Plain sum of `amount_minor`; an expense is positive, a refund makes it smaller or negative. */
  total: bigint;
};

export type MonthSummary = {
  key: string;
  income: bigint;
  expense: bigint;
  /** income − expense */
  net: bigint;
};

export type BreakdownBy = 'category' | 'pocket';

export type BreakdownRow = {
  /** Category id (null = uncategorized) or pocket id. */
  id: string | null;
  name: string;
  /** Stored category colour, if any; pockets have none. */
  color: string | null;
  total: bigint;
  /** The pockets the row's transactions sit in, so a drill-down can ask for exactly them. */
  pocketIds: string[];
};

export type Breakdown = {
  /** Positive totals, largest first. */
  rows: BreakdownRow[];
  /** Negative totals (refunds outweigh the rest), most negative first. Zero totals are dropped. */
  negative: BreakdownRow[];
  /** Sum of `rows`: the base of each row's share. */
  positiveTotal: bigint;
};

export const UNCATEGORIZED_NAME = 'Uncategorized';

/** At least this many earlier months are needed before an average is shown. */
export const MIN_AVERAGE_MONTHS = 3;
/** The average looks back this many months. */
export const AVERAGE_MONTHS = 12;

/** The calendar month (device time zone) that holds `ms`. */
export function monthOf(ms: number): ReportMonth {
  return monthRangeFor(ms, ms)[0]!;
}

/** Parses `YYYY-MM` into its bounds; throws on anything else. */
export function monthFromKey(key: string): ReportMonth {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  const month = m ? Number(m[2]) : 0;
  if (!m || month < 1 || month > 12) throw new Error(`Not a month key: ${key}`);
  return monthOf(new Date(Number(m[1]), month - 1, 1).getTime());
}

/** The key `delta` months after (or before, when negative) `key`. */
export function shiftMonthKey(key: string, delta: number): string {
  const { fromMs } = monthFromKey(key);
  const d = new Date(fromMs);
  return monthKey(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}

/** `count` consecutive months ending with `lastKey`, oldest first. */
export function monthsEndingAt(lastKey: string, count: number): ReportMonth[] {
  if (count < 1) return [];
  const first = monthFromKey(shiftMonthKey(lastKey, -(count - 1)));
  return monthRangeFor(first.fromMs, monthFromKey(lastKey).fromMs);
}

/** Income, expense and net for each of `keys`; a month without rows is all zeros. */
export function summarizeMonths(rows: readonly FlowRow[], keys: readonly string[]): Map<string, MonthSummary> {
  const out = new Map<string, MonthSummary>();
  for (const key of keys) out.set(key, { key, income: 0n, expense: 0n, net: 0n });
  for (const r of rows) {
    const s = out.get(r.month);
    if (!s) continue;
    if (r.kind === 'income') s.income += r.total;
    else s.expense += r.total;
  }
  for (const s of out.values()) s.net = s.income - s.expense;
  return out;
}

/**
 * Monthly average of `kind` over the up to 12 months before `key`. Months before `firstMonthKey`
 * (the first month with any transaction) do not count; an empty month after it counts as zero.
 * Returns null when fewer than three months count, or when a counted month is missing from
 * `summaries` (not loaded). The division truncates toward zero; the value is for display only.
 */
export function monthlyAverage(
  summaries: ReadonlyMap<string, MonthSummary>,
  key: string,
  kind: ReportKind,
  firstMonthKey: string | null
): bigint | null {
  if (firstMonthKey === null) return null;
  let sum = 0n;
  let count = 0n;
  for (let i = 1; i <= AVERAGE_MONTHS; i++) {
    const k = shiftMonthKey(key, -i);
    if (k < firstMonthKey) break;
    const s = summaries.get(k);
    if (!s) return null;
    sum += kind === 'income' ? s.income : s.expense;
    count += 1n;
  }
  if (count < BigInt(MIN_AVERAGE_MONTHS)) return null;
  return sum / count;
}

/** One month's `kind` totals grouped by category or by pocket. */
export function buildBreakdown(
  rows: readonly FlowRow[],
  key: string,
  kind: ReportKind,
  by: BreakdownBy
): Breakdown {
  const groups = new Map<string, BreakdownRow>();
  for (const r of rows) {
    if (r.month !== key || r.kind !== kind) continue;
    const id = by === 'category' ? r.categoryId : r.pocketId;
    const mapKey = id ?? '';
    let g = groups.get(mapKey);
    if (!g) {
      g =
        by === 'category'
          ? { id, name: r.categoryName ?? UNCATEGORIZED_NAME, color: r.categoryColor, total: 0n, pocketIds: [] }
          : { id, name: r.pocketName, color: null, total: 0n, pocketIds: [] };
      groups.set(mapKey, g);
    }
    g.total += r.total;
    if (!g.pocketIds.includes(r.pocketId)) g.pocketIds.push(r.pocketId);
  }

  const byName = (a: BreakdownRow, b: BreakdownRow) => a.name.localeCompare(b.name);
  const all = [...groups.values()];
  const positive = all
    .filter((g) => g.total > 0n)
    .sort((a, b) => (a.total === b.total ? byName(a, b) : a.total > b.total ? -1 : 1));
  const negative = all
    .filter((g) => g.total < 0n)
    .sort((a, b) => (a.total === b.total ? byName(a, b) : a.total < b.total ? -1 : 1));
  return {
    rows: positive,
    negative,
    positiveTotal: positive.reduce((acc, g) => acc + g.total, 0n),
  };
}

/**
 * Month-end balances from per-month balance changes. The first month's change must already hold
 * everything before it (the repository leaves its lower bound open), so the running sum is the
 * balance at the end of each month. A month without a change keeps the previous balance.
 */
export function cumulativeBalances(
  months: readonly ReportMonth[],
  deltas: ReadonlyMap<string, bigint>
): Map<string, bigint> {
  const out = new Map<string, bigint>();
  let running = 0n;
  for (const m of months) {
    running += deltas.get(m.key) ?? 0n;
    out.set(m.key, running);
  }
  return out;
}

/**
 * `WITH m(month_key, from_ms, to_ms) AS (VALUES …)`: one row per month (key, inclusive start, exclusive end), so a
 * single query can group the ledger by month. With `openStart`, the first month also takes
 * everything before it (for running balances).
 */
export function monthsCteSql(
  months: readonly ReportMonth[],
  options: { openStart?: boolean } = {}
): { sql: string; params: (string | number)[] } {
  if (months.length === 0) throw new Error('No months to query.');
  const params: (string | number)[] = [];
  months.forEach((m, i) => {
    params.push(m.key, i === 0 && options.openStart ? Number.MIN_SAFE_INTEGER : m.fromMs, m.toMs);
  });
  const values = months.map(() => '(?, ?, ?)').join(', ');
  return { sql: `WITH m(month_key, from_ms, to_ms) AS (VALUES ${values})`, params };
}

/** Rounds a step up to 1, 2, 2.5 or 5 times a power of ten, so axis ticks read as round numbers. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

/**
 * Vertical scale for bars that start at zero: `top` ≥ every value, `bottom` ≤ every value (0 when
 * none is negative), both whole multiples of a round `step`.
 */
export function chartScale(values: readonly number[], sections = 4): { top: number; bottom: number; step: number } {
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  if (max === 0 && min === 0) return { top: 1, bottom: 0, step: 1 };
  const step = niceStep((max - min) / sections);
  // `+ 0` turns a -0 into 0.
  return { top: Math.ceil(max / step) * step + 0, bottom: Math.floor(min / step) * step + 0, step };
}
