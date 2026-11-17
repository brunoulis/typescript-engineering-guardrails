import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLocalTestDatabase } from '../src/config.js';

test('database guard rejects remote, wrong database, credentials missing and query overrides', () => {
  for (const url of [
    'postgres://user:pass@db.example.com:55432/guardrails_backend',
    'postgres://user:pass@localhost:55432/production',
    'postgres://localhost:55432/guardrails_backend',
    'postgres://user:pass@localhost:55432/guardrails_backend?host=db.example.com',
    'https://user:pass@localhost:55432/guardrails_backend',
  ]) assert.throws(() => assertLocalTestDatabase(url), /dedicated local test database/);
});

test('database guard accepts explicit dedicated loopback fixture URL', () => {
  assert.doesNotThrow(() => assertLocalTestDatabase('postgres://user:pass@127.0.0.1:55432/guardrails_backend'));
});
