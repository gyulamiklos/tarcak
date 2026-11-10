/**
 * History filters as SQL conditions, so the database filters and pages the ledger
 * instead of the screen slicing the most recent N rows.
 */

export const UNCATEGORIZED_FILTER = '__uncategorized__';

export type TransactionFilter = {
  kinds?: string[];
  currencies?: string[];
  pocketIds?: string[];
  categoryIds?: string[];
  /** Lets the `income` kind include transfers pooled into the Jar from another pocket. */
  jarPocketId?: string | null;
  /** Inclusive lower bound on `occurred_at` (Unix ms). */
  fromMs?: number;
  /** Exclusive upper bound on `occurred_at` (Unix ms). */
  toMs?: number;
};

/**
 * The transactions behind one Statistics breakdown row: one kind, one currency and one month,
 * optionally one category (`null` = uncategorized) and the pockets the row's sum came from.
 */
export type TransactionDrill = {
  /** Shown on the History chip, e.g. `Oct 2026 · Groceries · Expense`. */
  label: string;
  currency: string;
  kind: 'income' | 'expense';
  fromMs: number;
  toMs: number;
  /** Absent = every category; `null` = uncategorized. */
  categoryId?: string | null;
  /** Absent = every pocket. */
  pocketIds?: string[];
};

/** Exactly the rows a Statistics sum counted: no Jar pooling, so `income` means the income kind only. */
export function filterForDrill(drill: TransactionDrill): TransactionFilter {
  return {
    kinds: [drill.kind],
    currencies: [drill.currency],
    pocketIds: drill.pocketIds ?? [],
    categoryIds:
      drill.categoryId === undefined ? [] : [drill.categoryId === null ? UNCATEGORIZED_FILTER : drill.categoryId],
    jarPocketId: null,
    fromMs: drill.fromMs,
    toMs: drill.toMs,
  };
}

/** Values inside one dimension are ORed; the dimensions are ANDed by the caller. */
export function buildTransactionFilter(filter: TransactionFilter): {
  clauses: string[];
  params: (string | number)[];
} {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filter.kinds?.length) {
    const parts: string[] = [];
    for (const kind of filter.kinds) {
      parts.push('kind = ?');
      params.push(kind);
      if (kind === 'income' && filter.jarPocketId) {
        parts.push("(kind = 'transfer' AND to_pocket_id = ? AND from_pocket_id != ?)");
        params.push(filter.jarPocketId, filter.jarPocketId);
      }
    }
    clauses.push(`(${parts.join(' OR ')})`);
  }

  if (filter.currencies?.length) {
    clauses.push(`currency IN (${filter.currencies.map(() => '?').join(', ')})`);
    params.push(...filter.currencies);
  }

  if (filter.pocketIds?.length) {
    const parts: string[] = [];
    for (const id of filter.pocketIds) {
      parts.push('pocket_id = ?', 'from_pocket_id = ?', 'to_pocket_id = ?');
      params.push(id, id, id);
    }
    clauses.push(`(${parts.join(' OR ')})`);
  }

  if (filter.categoryIds?.length) {
    const parts: string[] = [];
    for (const id of filter.categoryIds) {
      if (id === UNCATEGORIZED_FILTER) {
        parts.push('category_id IS NULL');
      } else {
        parts.push('category_id = ?');
        params.push(id);
      }
    }
    clauses.push(`(${parts.join(' OR ')})`);
  }

  if (filter.fromMs !== undefined) {
    clauses.push('occurred_at >= ?');
    params.push(filter.fromMs);
  }
  if (filter.toMs !== undefined) {
    clauses.push('occurred_at < ?');
    params.push(filter.toMs);
  }

  return { clauses, params };
}
