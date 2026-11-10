import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  buildBreakdown,
  chartScale,
  cumulativeBalances,
  monthFromKey,
  monthlyAverage,
  monthOf,
  monthsCteSql,
  monthsEndingAt,
  niceStep,
  shiftMonthKey,
  summarizeMonths,
  UNCATEGORIZED_NAME,
  type FlowRow,
  type MonthSummary,
} from '../src/domain/monthlyStats';

/** Whole major units → minor units (1 unit = 10^8 minor). */
const major = (n: number | bigint) => BigInt(n) * 100_000_000n;

function row(partial: Partial<FlowRow> & Pick<FlowRow, 'month' | 'kind' | 'total'>): FlowRow {
  return {
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    pocketId: 'p1',
    pocketName: 'Wallet',
    ...partial,
  };
}

let savedTz: string | undefined;
before(() => {
  savedTz = process.env.TZ;
  process.env.TZ = 'Europe/Budapest';
});
after(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});

describe('month keys', () => {
  test('monthFromKey gives local-midnight bounds', () => {
    const m = monthFromKey('2026-10');
    assert.equal(m.key, '2026-10');
    assert.equal(m.fromMs, new Date(2026, 9, 1).getTime());
    assert.equal(m.toMs, new Date(2026, 10, 1).getTime());
  });

  test('monthFromKey rejects malformed keys', () => {
    for (const bad of ['2026-13', '2026-00', '2026-1', '26-10', '']) {
      assert.throws(() => monthFromKey(bad), /Not a month key/);
    }
  });

  test('monthOf puts the last millisecond in the month and midnight in the next', () => {
    const end = new Date(2026, 9, 31, 23, 59, 59, 999).getTime();
    assert.equal(monthOf(end).key, '2026-10');
    assert.equal(monthOf(end + 1).key, '2026-11');
  });

  test('shiftMonthKey crosses year boundaries both ways', () => {
    assert.equal(shiftMonthKey('2026-01', -1), '2025-12');
    assert.equal(shiftMonthKey('2025-12', 1), '2026-01');
    assert.equal(shiftMonthKey('2026-03', -14), '2025-01');
    assert.equal(shiftMonthKey('2026-03', 0), '2026-03');
  });

  test('monthsEndingAt lists consecutive months oldest first', () => {
    assert.deepEqual(
      monthsEndingAt('2026-02', 4).map((m) => m.key),
      ['2025-11', '2025-12', '2026-01', '2026-02']
    );
    assert.deepEqual(monthsEndingAt('2026-02', 1).map((m) => m.key), ['2026-02']);
    assert.deepEqual(monthsEndingAt('2026-02', 0), []);
  });
});

describe('summarizeMonths', () => {
  test('sums per month and fills empty months with zeros', () => {
    const rows = [
      row({ month: '2026-10', kind: 'income', total: major(640_000) }),
      row({ month: '2026-10', kind: 'expense', total: major(500_000) }),
      row({ month: '2026-10', kind: 'expense', total: major(188_200), categoryId: 'c1' }),
      row({ month: '2026-08', kind: 'expense', total: major(1) }),
    ];
    const s = summarizeMonths(rows, ['2026-09', '2026-10']);
    assert.deepEqual(s.get('2026-09'), { key: '2026-09', income: 0n, expense: 0n, net: 0n });
    assert.deepEqual(s.get('2026-10'), {
      key: '2026-10',
      income: major(640_000),
      expense: major(688_200),
      net: -major(48_200),
    });
    assert.equal(s.has('2026-08'), false);
  });

  test('stays exact above 2^53 minor', () => {
    const big = 2n ** 60n;
    const s = summarizeMonths(
      [
        row({ month: '2026-10', kind: 'income', total: big }),
        row({ month: '2026-10', kind: 'income', total: 1n }),
      ],
      ['2026-10']
    );
    assert.equal(s.get('2026-10')!.income, big + 1n);
    assert.equal(s.get('2026-10')!.net, big + 1n);
  });

  test('a refund-heavy month has a negative expense', () => {
    const s = summarizeMonths(
      [
        row({ month: '2026-10', kind: 'expense', total: major(10) }),
        row({ month: '2026-10', kind: 'expense', total: -major(30) }),
      ],
      ['2026-10']
    );
    assert.equal(s.get('2026-10')!.expense, -major(20));
    assert.equal(s.get('2026-10')!.net, major(20));
  });
});

describe('monthlyAverage', () => {
  function summaries(entries: [string, bigint][]): Map<string, MonthSummary> {
    return new Map(
      entries.map(([key, expense]) => [key, { key, income: 0n, expense, net: -expense }])
    );
  }

  test('averages the 12 months before the key, not the key itself', () => {
    const entries: [string, bigint][] = [];
    for (let i = 0; i <= 13; i++) entries.push([shiftMonthKey('2026-10', -i), i === 0 ? major(999) : major(i)]);
    const s = summaries(entries);
    // Months 1..12 back: 1 + 2 + … + 12 = 78 → 6.5.
    assert.equal(monthlyAverage(s, '2026-10', 'expense', '2020-01'), major(78) / 12n);
  });

  test('skips months before the first transaction and counts empty months after it as zero', () => {
    const s = summaries([
      ['2026-06', major(9)],
      ['2026-07', major(30)],
      ['2026-08', 0n],
      ['2026-09', major(60)],
    ]);
    assert.equal(monthlyAverage(s, '2026-10', 'expense', '2026-07'), major(30));
  });

  test('needs at least three months', () => {
    const s = summaries([
      ['2026-08', major(10)],
      ['2026-09', major(20)],
    ]);
    assert.equal(monthlyAverage(s, '2026-10', 'expense', '2026-08'), null);
    assert.equal(monthlyAverage(s, '2026-10', 'expense', null), null);
  });

  test('returns null when a counted month is not loaded', () => {
    const s = summaries([
      ['2026-07', major(10)],
      ['2026-09', major(20)],
    ]);
    assert.equal(monthlyAverage(s, '2026-10', 'expense', '2026-07'), null);
  });

  test('reads income for the income kind and truncates toward zero', () => {
    const s = new Map<string, MonthSummary>(
      ['2026-07', '2026-08', '2026-09'].map((key, i) => [
        key,
        { key, income: BigInt(i === 0 ? 2 : 0), expense: 0n, net: 0n },
      ])
    );
    assert.equal(monthlyAverage(s, '2026-10', 'income', '2026-07'), 0n);
    const neg = new Map<string, MonthSummary>(
      ['2026-07', '2026-08', '2026-09'].map((key, i) => [
        key,
        { key, income: BigInt(i === 0 ? -2 : 0), expense: 0n, net: 0n },
      ])
    );
    assert.equal(monthlyAverage(neg, '2026-10', 'income', '2026-07'), 0n);
  });
});

describe('buildBreakdown', () => {
  const rows: FlowRow[] = [
    row({ month: '2026-10', kind: 'expense', total: major(100), categoryId: 'food', categoryName: 'Food', categoryColor: '#ff0000', pocketId: 'p1', pocketName: 'Wallet' }),
    row({ month: '2026-10', kind: 'expense', total: major(50), categoryId: 'food', categoryName: 'Food', categoryColor: '#ff0000', pocketId: 'p2', pocketName: 'Bank' }),
    row({ month: '2026-10', kind: 'expense', total: major(150), categoryId: 'rent', categoryName: 'Rent', pocketId: 'p2', pocketName: 'Bank' }),
    row({ month: '2026-10', kind: 'expense', total: major(20), pocketId: 'p1', pocketName: 'Wallet' }),
    row({ month: '2026-10', kind: 'expense', total: -major(40), categoryId: 'shop', categoryName: 'Shop', pocketId: 'p1', pocketName: 'Wallet' }),
    row({ month: '2026-10', kind: 'expense', total: major(5), categoryId: 'zero', categoryName: 'Zero', pocketId: 'p1', pocketName: 'Wallet' }),
    row({ month: '2026-10', kind: 'expense', total: -major(5), categoryId: 'zero', categoryName: 'Zero', pocketId: 'p2', pocketName: 'Bank' }),
    row({ month: '2026-10', kind: 'income', total: major(999), categoryId: 'pay', categoryName: 'Pay' }),
    row({ month: '2026-09', kind: 'expense', total: major(999), categoryId: 'food', categoryName: 'Food' }),
  ];

  test('groups by category, largest first, with the pockets behind each row', () => {
    const b = buildBreakdown(rows, '2026-10', 'expense', 'category');
    assert.deepEqual(
      b.rows.map((r) => [r.id, r.name, r.total, r.pocketIds]),
      [
        ['food', 'Food', major(150), ['p1', 'p2']],
        ['rent', 'Rent', major(150), ['p2']],
        [null, UNCATEGORIZED_NAME, major(20), ['p1']],
      ]
    );
    assert.equal(b.rows[0]!.color, '#ff0000');
    assert.equal(b.positiveTotal, major(320));
  });

  test('keeps negative totals apart and drops zero totals', () => {
    const b = buildBreakdown(rows, '2026-10', 'expense', 'category');
    assert.deepEqual(b.negative.map((r) => [r.id, r.total]), [['shop', -major(40)]]);
    assert.equal([...b.rows, ...b.negative].some((r) => r.id === 'zero'), false);
  });

  test('groups by pocket', () => {
    const b = buildBreakdown(rows, '2026-10', 'expense', 'pocket');
    assert.deepEqual(
      b.rows.map((r) => [r.id, r.name, r.total, r.pocketIds, r.color]),
      [
        ['p2', 'Bank', major(195), ['p2'], null],
        ['p1', 'Wallet', major(85), ['p1'], null],
      ]
    );
    assert.deepEqual(b.negative, []);
  });

  test('an empty month gives an empty breakdown', () => {
    const b = buildBreakdown(rows, '2026-11', 'expense', 'category');
    assert.deepEqual(b, { rows: [], negative: [], positiveTotal: 0n });
  });
});

describe('cumulativeBalances', () => {
  test('runs the sum and carries a month without changes', () => {
    const months = monthsEndingAt('2026-10', 3);
    const out = cumulativeBalances(
      months,
      new Map([
        ['2026-08', major(1000)],
        ['2026-10', -major(1)],
      ])
    );
    assert.deepEqual([...out.entries()], [
      ['2026-08', major(1000)],
      ['2026-09', major(1000)],
      ['2026-10', major(999)],
    ]);
  });
});

describe('monthsCteSql', () => {
  test('one VALUES row per month, keys and bounds as params', () => {
    const months = monthsEndingAt('2026-10', 2);
    const { sql, params } = monthsCteSql(months);
    assert.equal(sql, 'WITH m(month_key, from_ms, to_ms) AS (VALUES (?, ?, ?), (?, ?, ?))');
    assert.deepEqual(params, [
      '2026-09', months[0]!.fromMs, months[0]!.toMs,
      '2026-10', months[1]!.fromMs, months[1]!.toMs,
    ]);
  });

  test('openStart leaves only the first lower bound open', () => {
    const months = monthsEndingAt('2026-10', 2);
    const { params } = monthsCteSql(months, { openStart: true });
    assert.equal(params[1], Number.MIN_SAFE_INTEGER);
    assert.equal(params[4], months[1]!.fromMs);
  });

  test('refuses an empty list', () => {
    assert.throws(() => monthsCteSql([]));
  });
});

describe('chart scale', () => {
  test('niceStep rounds up to 1, 2, 2.5, 5 × 10^n', () => {
    assert.equal(niceStep(0.9), 1);
    assert.equal(niceStep(1.5), 2);
    assert.equal(niceStep(2.2), 2.5);
    assert.equal(niceStep(3), 5);
    assert.equal(niceStep(7), 10);
    assert.equal(niceStep(130), 200);
    assert.equal(niceStep(0), 1);
  });

  test('positive values start at zero', () => {
    assert.deepEqual(chartScale([0, 300, 1000]), { top: 1000, bottom: 0, step: 250 });
  });

  test('a negative value opens room below zero', () => {
    const s = chartScale([1000, -300]);
    assert.equal(s.step, 500);
    assert.equal(s.top, 1000);
    assert.equal(s.bottom, -500);
  });

  test('all zeros or no values still give a usable scale', () => {
    assert.deepEqual(chartScale([0, 0]), { top: 1, bottom: 0, step: 1 });
    assert.deepEqual(chartScale([]), { top: 1, bottom: 0, step: 1 });
  });
});
