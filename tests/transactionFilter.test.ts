import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildTransactionFilter, filterForDrill, UNCATEGORIZED_FILTER } from '../src/domain/transactionFilter';

describe('buildTransactionFilter', () => {
  test('no filters give no clauses', () => {
    assert.deepEqual(buildTransactionFilter({}), { clauses: [], params: [] });
    assert.deepEqual(
      buildTransactionFilter({ kinds: [], currencies: [], pocketIds: [], categoryIds: [] }),
      { clauses: [], params: [] }
    );
  });

  test('a plain kind matches on the kind column', () => {
    const f = buildTransactionFilter({ kinds: ['expense', 'transfer'] });
    assert.deepEqual(f.clauses, ['(kind = ? OR kind = ?)']);
    assert.deepEqual(f.params, ['expense', 'transfer']);
  });

  test('income also matches transfers into the Jar from another pocket', () => {
    const f = buildTransactionFilter({ kinds: ['income'], jarPocketId: 'jar' });
    assert.deepEqual(f.clauses, [
      "(kind = ? OR (kind = 'transfer' AND to_pocket_id = ? AND from_pocket_id != ?))",
    ]);
    assert.deepEqual(f.params, ['income', 'jar', 'jar']);
  });

  test('income without a Jar is only the income kind', () => {
    const f = buildTransactionFilter({ kinds: ['income'], jarPocketId: null });
    assert.deepEqual(f.clauses, ['(kind = ?)']);
    assert.deepEqual(f.params, ['income']);
  });

  test('currencies match with IN', () => {
    const f = buildTransactionFilter({ currencies: ['HUF', 'EUR'] });
    assert.deepEqual(f.clauses, ['currency IN (?, ?)']);
    assert.deepEqual(f.params, ['HUF', 'EUR']);
  });

  test('a pocket matches as the pocket or either side of a transfer', () => {
    const f = buildTransactionFilter({ pocketIds: ['a', 'b'] });
    assert.deepEqual(f.clauses, [
      '(pocket_id = ? OR from_pocket_id = ? OR to_pocket_id = ? OR pocket_id = ? OR from_pocket_id = ? OR to_pocket_id = ?)',
    ]);
    assert.deepEqual(f.params, ['a', 'a', 'a', 'b', 'b', 'b']);
  });

  test('categories combine real ids and the uncategorized token', () => {
    const f = buildTransactionFilter({ categoryIds: ['c1', UNCATEGORIZED_FILTER] });
    assert.deepEqual(f.clauses, ['(category_id = ? OR category_id IS NULL)']);
    assert.deepEqual(f.params, ['c1']);
  });

  test('dimensions are ANDed, values inside one dimension ORed, params stay in clause order', () => {
    const f = buildTransactionFilter({
      kinds: ['expense'],
      currencies: ['HUF'],
      pocketIds: ['a'],
      categoryIds: [UNCATEGORIZED_FILTER],
    });
    assert.equal(f.clauses.length, 4);
    assert.deepEqual(f.params, ['expense', 'HUF', 'a', 'a', 'a']);
  });

  test('time bounds are inclusive below and exclusive above', () => {
    const f = buildTransactionFilter({ kinds: ['expense'], fromMs: 100, toMs: 200 });
    assert.deepEqual(f.clauses, ['(kind = ?)', 'occurred_at >= ?', 'occurred_at < ?']);
    assert.deepEqual(f.params, ['expense', 100, 200]);
  });
});

describe('filterForDrill', () => {
  const base = { label: 'Oct 2026', currency: 'HUF', fromMs: 100, toMs: 200 };

  test('income means the income kind only, without Jar pooling', () => {
    const f = buildTransactionFilter(filterForDrill({ ...base, kind: 'income' }));
    assert.deepEqual(f.clauses, ['(kind = ?)', 'currency IN (?)', 'occurred_at >= ?', 'occurred_at < ?']);
    assert.deepEqual(f.params, ['income', 'HUF', 100, 200]);
  });

  test('a null category asks for uncategorized rows, an absent one for every category', () => {
    assert.deepEqual(filterForDrill({ ...base, kind: 'expense', categoryId: null }).categoryIds, [UNCATEGORIZED_FILTER]);
    assert.deepEqual(filterForDrill({ ...base, kind: 'expense', categoryId: 'c1' }).categoryIds, ['c1']);
    assert.deepEqual(filterForDrill({ ...base, kind: 'expense' }).categoryIds, []);
  });

  test('pockets pass through; absent means every pocket', () => {
    assert.deepEqual(filterForDrill({ ...base, kind: 'expense', pocketIds: ['a', 'b'] }).pocketIds, ['a', 'b']);
    assert.deepEqual(filterForDrill({ ...base, kind: 'expense' }).pocketIds, []);
  });
});
