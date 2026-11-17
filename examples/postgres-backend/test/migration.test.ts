import assert from 'node:assert/strict';
import test from 'node:test';
import postgres from 'postgres';
import { requiredEnvironment, assertLocalTestDatabase } from '../src/config.js';
import { migrateDatabase } from '../src/migrate.js';

test('migration creates the real auth, membership, task and outbox tables', async () => {
  const url = requiredEnvironment('BACKEND_MIGRATION_DATABASE_URL');
  assertLocalTestDatabase(url);
  await migrateDatabase(url);
  const client = postgres(url, { max: 1 });
  try {
    const rows = await client`SELECT to_regclass('auth_user') AS auth, to_regclass('membership') AS membership, to_regclass('task') AS task, to_regclass('outbox') AS outbox`;
    assert.equal(rows[0]?.auth, 'auth_user');
    assert.equal(rows[0]?.membership, 'membership');
    assert.equal(rows[0]?.task, 'task');
    assert.equal(rows[0]?.outbox, 'outbox');
  } finally { await client.end({ timeout: 5 }); }
});
