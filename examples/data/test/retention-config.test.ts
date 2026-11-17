import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRetentionBudget, normalizedPositiveInteger, verifyPolicyChange } from '../src/retention-config.ts';

test('raw retention must exceed lookback plus the explicit bucket and scheduler budgets', () => {
  const hour = 3_600_000;
  const budget = { refreshLookbackMs: 720 * hour, bucketWidthMs: hour, schedulerDelayBudgetMs: 2 * hour };
  // Seven days, equality and merely exceeding the lookback all fail a 30-day refresh budget.
  for (const rawRetentionMs of [168, 720, 721, 723].map(hours => hours * hour)) {
    assert.throws(() => assertRetentionBudget({ ...budget, rawRetentionMs }), RangeError);
  }
  assert.doesNotThrow(() => assertRetentionBudget({ ...budget, rawRetentionMs: 724 * hour }));
});

test('the budget guard rejects missing, nonfinite and negative operational bounds', () => {
  const budget = { rawRetentionMs: 800, refreshLookbackMs: 720, bucketWidthMs: 1, schedulerDelayBudgetMs: 2 };
  for (const schedulerDelayBudgetMs of [NaN, Infinity, -1]) {
    assert.throws(() => assertRetentionBudget({ ...budget, schedulerDelayBudgetMs }), RangeError);
  }
  assert.throws(() => assertRetentionBudget({ ...budget, bucketWidthMs: 0 }), RangeError);
  assert.throws(() => assertRetentionBudget({ ...budget, refreshLookbackMs: Infinity }), RangeError);
});

test('normalization cannot turn a positive fraction into a zero-day retention or zero-size pool', () => {
  for (const setting of ['RETENTION_DAYS', 'POOL_MAX']) {
    for (const value of ['0.5', '0', '-1', '', ' ', 'Infinity', 'NaN', '9007199254740992']) {
      assert.throws(() => normalizedPositiveInteger(value, setting), RangeError);
    }
    assert.equal(normalizedPositiveInteger(' 2.9 ', setting), 2);
    assert.equal(normalizedPositiveInteger('1', setting), 1);
  }
});

test('a rejected policy statement returns failed rather than a verified applied outcome', async () => {
  const sqlError = new Error('policy statement rejected');
  const outcome = await verifyPolicyChange(
    async () => { throw sqlError; },
    async () => { throw new Error('readback cannot repair a failed statement'); },
  );
  assert.deepEqual(outcome, { status: 'failed', error: sqlError });
});

test('successful SQL requires matching catalog readback before reporting applied', async () => {
  assert.equal((await verifyPolicyChange(async () => {}, async () => true)).status, 'applied');
  const mismatch = await verifyPolicyChange(async () => {}, async () => false);
  assert.equal(mismatch.status, 'failed');
  const catalogError = new Error('catalog unavailable');
  assert.deepEqual(await verifyPolicyChange(async () => {}, async () => { throw catalogError; }), {
    status: 'failed', error: catalogError,
  });
});
