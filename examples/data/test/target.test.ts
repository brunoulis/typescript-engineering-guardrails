import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertDedicatedTarget } from '../src/target.ts';
test('destructive fixtures refuse remote and nonfixture database targets', () => {
  assert.throws(() => assertDedicatedTarget('postgres://guardrails:x@production.example:5432/guardrails_data'));
  assert.throws(() => assertDedicatedTarget('postgres://guardrails:x@localhost:55432/customers'));
  assert.doesNotThrow(() => assertDedicatedTarget('postgres://guardrails:local_guardrails_only@127.0.0.1:55432/guardrails_data'));
});
