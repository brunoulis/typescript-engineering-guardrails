import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, runCorpus, distribution } from '../bench/corpus.js';

test('label comparison counts missing and excess indications independently', () => {
  assert.deepEqual(classify(2, 1), { tp: 1, fp: 0, fn: 1 });
  assert.deepEqual(classify(0, 2), { tp: 0, fp: 2, fn: 0 });
  assert.deepEqual(classify(1, 1), { tp: 1, fp: 0, fn: 0 });
});

test('fixed labelled corpus records actual syntax and typed rule behavior with immutable targets', () => {
  const result = runCorpus();
  assert.equal(result.cases.length, 42);
  assert.deepEqual(result.totals.syntax, { tp: 13, fp: 2, fn: 1 });
  assert.deepEqual(result.totals.typed, { tp: 14, fp: 0, fn: 0 });
  assert.ok(result.cases.every(item => item.status === 'COMPLETE' && item.targetUnchanged));
  assert.equal(new Set(result.cases.map(item => item.rule)).size, 8);
});

test('benchmark distribution reports median and spread from measurements', () => {
  assert.deepEqual(distribution([9, 1, 5, 3, 7]), { median: 5, min: 1, max: 9, iqr: 4 });
  assert.deepEqual(distribution([3, 1, 7, 5]), { median: 4, min: 1, max: 7, iqr: 3 });
});
