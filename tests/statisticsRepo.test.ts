import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { getBalanceTimeline, type StatisticsScope } from '../src/db/repositories/statistics';
import { addTx, createLedgerTables } from './ledgerFixture';

describe('getBalanceTimeline baseline', () => {
  beforeEach(createLedgerTables);

  const outsideJar: StatisticsScope = { mode: 'exclude_jar', jarId: 'jar' };

  test('a transfer between two pockets outside the Jar leaves the Outside Jar balance alone', async () => {
    addTx({ kind: 'income', amount: 100, at: 1_000, pocket: 'p1' });
    addTx({ kind: 'transfer', amount: 50, at: 2_000, from: 'p1', to: 'p2' });
    addTx({ kind: 'transfer', amount: 30, at: 3_000, from: 'p1', to: 'jar' });
    addTx({ kind: 'transfer', amount: 5, at: 4_000, from: 'jar', to: 'p2' });
    const points = await getBalanceTimeline('HUF', outsideJar, 10_000, 20_000);
    assert.equal(points[0]!.balance_minor, 75);
  });

  test('a single pocket counts transfers in and out', async () => {
    addTx({ kind: 'income', amount: 100, at: 1_000, pocket: 'p1' });
    addTx({ kind: 'transfer', amount: 50, at: 2_000, from: 'p1', to: 'p2' });
    addTx({ kind: 'transfer', amount: 20, at: 3_000, from: 'jar', to: 'p1' });
    addTx({ kind: 'expense', amount: 7, at: 4_000, pocket: 'p1' });
    const points = await getBalanceTimeline('HUF', { mode: 'pocket', pocketId: 'p1' }, 10_000, 20_000);
    assert.equal(points[0]!.balance_minor, 63);
  });
});
