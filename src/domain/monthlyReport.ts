/**
 * The monthly income/expense report as CSV. Pure logic (no React Native or database imports) so the
 * Node test runner covers it; the repository supplies grouped sums, the screen only shows the preview
 * and shares the file. Amounts are BigInt end to end: nothing here goes through `number` arithmetic.
 */

import { AMOUNT_MINOR_SCALE, MAX_AMOUNT_DECIMALS } from '../utils/amountMinor';

const SCALE_BI = BigInt(AMOUNT_MINOR_SCALE);

export const MAX_REPORT_MONTHS = 240;

export type ReportKind = 'income' | 'expense';

export type ReportMonth = {
  /** `YYYY-MM`, the calendar month in the device time zone. */
  key: string;
  /** Inclusive start (local midnight on the 1st). */
  fromMs: number;
  /** Exclusive end (local midnight on the 1st of the next month). */
  toMs: number;
};

/** One grouped sum from the ledger; `total` is the plain sum of `amount_minor` (a refund is negative). */
export type ReportRow = {
  month: string;
  currency: string;
  kind: ReportKind;
  /** Category name, or `null` for a transaction without a category. */
  category: string | null;
  total: bigint;
};

export type DecimalMark = ',' | '.';
export type CsvFormat = 'hungarian' | 'international';

export const CSV_FORMATS: Record<CsvFormat, { delimiter: ';' | ','; decimalMark: DecimalMark }> = {
  hungarian: { delimiter: ';', decimalMark: ',' },
  international: { delimiter: ',', decimalMark: '.' },
};

export type ReportOptions = {
  /** Month keys in the range; every one of them gets a row in the summary layout. */
  months: string[];
  /** Currencies to include; anything else is dropped from the file. */
  currencies: string[];
  /** Long form with category names instead of the monthly summary. */
  breakdown: boolean;
  format: CsvFormat;
};

export const REPORT_FILE_PREFIX = 'tarcak-report-';

const UNCATEGORIZED = 'Uncategorized';
const BOM = '﻿';
const EOL = '\r\n';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function monthKey(d: Date): string {
  return `${String(d.getFullYear()).padStart(4, '0')}-${pad2(d.getMonth() + 1)}`;
}

/** `tarcak-report-YYYY-MM-DD.csv`: only the export day, nothing about the data. */
export function reportFileName(exportedAt: Date): string {
  const day = `${monthKey(exportedAt)}-${pad2(exportedAt.getDate())}`;
  return `${REPORT_FILE_PREFIX}${day}.csv`;
}

/**
 * The calendar months (device time zone) from the one holding `startMs` to the one holding `endMs`.
 * The bounds come from `new Date(y, m, 1)`, so a month with a DST change is 23 or 25 hours off and
 * still ends exactly at the next local midnight.
 */
export function monthRangeFor(startMs: number, endMs: number): ReportMonth[] {
  const start = new Date(startMs);
  const end = new Date(endMs);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || endMs < startMs) {
    throw new Error('Pick a valid time range.');
  }
  const count =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  if (count > MAX_REPORT_MONTHS) {
    throw new Error(`At most ${MAX_REPORT_MONTHS} months can be exported. Narrow the time range.`);
  }
  const months: ReportMonth[] = [];
  for (let i = 0; i < count; i++) {
    const from = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const to = new Date(start.getFullYear(), start.getMonth() + i + 1, 1);
    months.push({ key: monthKey(from), fromMs: from.getTime(), toMs: to.getTime() });
  }
  return months;
}

/** Minor units → full-precision decimal text: no rounding, no digit grouping, no trailing zeros. */
export function formatMinorExact(minor: bigint, decimalMark: DecimalMark): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / SCALE_BI;
  const frac = (abs % SCALE_BI).toString().padStart(MAX_AMOUNT_DECIMALS, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? decimalMark + frac : ''}`;
}

function quoteIfNeeded(text: string, delimiter: string): string {
  if (text.includes(delimiter) || /["\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * A text cell. A leading `=`, `+`, `-`, `@`, tab or CR would make a spreadsheet run the cell as a formula,
 * so it gets a leading apostrophe. Amount cells do not go through here (a negative number starts with `-`).
 */
export function csvCell(text: string, delimiter: string): string {
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return quoteIfNeeded(safe, delimiter);
}

/** Deterministic order (case-insensitive, then by code unit); `localeCompare` depends on the device's ICU. */
function compareText(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x !== y) return x < y ? -1 : 1;
  return a === b ? 0 : a < b ? -1 : 1;
}

type SummaryLine = { month: string; currency: string; income: bigint; expense: bigint; net: bigint };
type BreakdownLine = {
  month: string;
  currency: string;
  kind: ReportKind;
  category: string | null;
  amount: bigint;
};

function inScope(rows: ReportRow[], options: ReportOptions): ReportRow[] {
  const months = new Set(options.months);
  const currencies = new Set(options.currencies);
  return rows.filter((r) => months.has(r.month) && currencies.has(r.currency));
}

function summarize(rows: ReportRow[], options: ReportOptions): SummaryLine[] {
  const sums = new Map<string, { income: bigint; expense: bigint }>();
  const key = (month: string, currency: string) => `${month}\0${currency}`;
  for (const r of rows) {
    const k = key(r.month, r.currency);
    const entry = sums.get(k) ?? { income: 0n, expense: 0n };
    entry[r.kind] += r.total;
    sums.set(k, entry);
  }
  const months = [...new Set(options.months)].sort();
  const currencies = [...new Set(options.currencies)].sort(compareText);
  const lines: SummaryLine[] = [];
  for (const month of months) {
    for (const currency of currencies) {
      const { income, expense } = sums.get(key(month, currency)) ?? { income: 0n, expense: 0n };
      lines.push({ month, currency, income, expense, net: income - expense });
    }
  }
  return lines;
}

function breakDown(rows: ReportRow[]): BreakdownLine[] {
  const sums = new Map<string, BreakdownLine>();
  for (const r of rows) {
    // A missing category stays apart from a category that happens to be named "Uncategorized".
    const k = [r.month, r.currency, r.kind, r.category === null ? 'n' : `s${r.category}`].join('\0');
    const line = sums.get(k);
    if (line) {
      line.amount += r.total;
    } else {
      sums.set(k, { month: r.month, currency: r.currency, kind: r.kind, category: r.category, amount: r.total });
    }
  }
  return [...sums.values()]
    .filter((l) => l.amount !== 0n)
    .sort(
      (a, b) =>
        compareText(a.month, b.month) ||
        compareText(a.currency, b.currency) ||
        (a.kind === b.kind ? 0 : a.kind === 'income' ? -1 : 1) ||
        compareText(a.category ?? UNCATEGORIZED, b.category ?? UNCATEGORIZED) ||
        (a.category === null ? 1 : 0) - (b.category === null ? 1 : 0)
    );
}

function csvRow(cells: string[], delimiter: string): string {
  return cells.join(delimiter) + EOL;
}

/** UTF-8 BOM, CRLF line ends. Summary layout by default, long form with category names when `breakdown`. */
export function buildReportCsv(rows: ReportRow[], options: ReportOptions): string {
  const { delimiter, decimalMark } = CSV_FORMATS[options.format];
  const scoped = inScope(rows, options);
  const amount = (v: bigint) => formatMinorExact(v, decimalMark);
  let csv = BOM;

  if (options.breakdown) {
    csv += csvRow(['month', 'currency', 'kind', 'category', 'amount'], delimiter);
    for (const l of breakDown(scoped)) {
      csv += csvRow(
        [
          csvCell(l.month, delimiter),
          csvCell(l.currency, delimiter),
          l.kind,
          csvCell(l.category ?? UNCATEGORIZED, delimiter),
          amount(l.amount),
        ],
        delimiter
      );
    }
    return csv;
  }

  csv += csvRow(['month', 'currency', 'income', 'expense', 'net'], delimiter);
  for (const l of summarize(scoped, options)) {
    csv += csvRow(
      [
        csvCell(l.month, delimiter),
        csvCell(l.currency, delimiter),
        amount(l.income),
        amount(l.expense),
        amount(l.net),
      ],
      delimiter
    );
  }
  return csv;
}

export type ReportPreview = {
  /** Nothing the file would list for the chosen months, currencies and layout: not worth exporting. */
  isEmpty: boolean;
  /** The monthly summary, as the same text the summary file would hold. */
  summary: { month: string; currency: string; income: string; expense: string; net: string }[];
  /** Distinct category names that the breakdown writes into the file; 0 without the breakdown. */
  categoryCount: number;
};

/** What the export screen shows. It runs the same aggregation as `buildReportCsv`. */
export function buildReportPreview(rows: ReportRow[], options: ReportOptions): ReportPreview {
  const { decimalMark } = CSV_FORMATS[options.format];
  const scoped = inScope(rows, options);
  const lines = options.breakdown ? breakDown(scoped) : [];
  const names = new Set<string>();
  for (const l of lines) {
    if (l.category !== null) names.add(l.category);
  }
  return {
    // The breakdown file lists non-zero sums only, so it can be empty although rows exist.
    isEmpty: options.breakdown ? lines.length === 0 : scoped.length === 0,
    summary: summarize(scoped, options).map((l) => ({
      month: l.month,
      currency: l.currency,
      income: formatMinorExact(l.income, decimalMark),
      expense: formatMinorExact(l.expense, decimalMark),
      net: formatMinorExact(l.net, decimalMark),
    })),
    categoryCount: names.size,
  };
}
