import assert from 'node:assert/strict';
import test from 'node:test';
import { request } from 'node:http';
import { once } from 'node:events';
import { startBackend } from '../src/server.js';
import { requiredEnvironment } from '../src/config.js';

test('local server remains usable after request cancellation and closes its listener and pool', async () => {
  const server = await startBackend({ databaseUrl: requiredEnvironment('BACKEND_TEST_DATABASE_URL'), secret: 'local-lifecycle-test-secret-with-32-characters' });
  try {
    assert.equal((await fetch(`${server.origin}/health`)).status, 200);
    const received = once(server.httpServer, 'request');
    const incoming = request(`${server.origin}/api/auth/sign-in/email`, { method: 'POST', headers: { origin: server.origin, 'content-type': 'application/json' } });
    incoming.on('error', () => {}); // ECONNRESET is the intentional client cancellation.
    incoming.write('{"email":');
    await received; incoming.destroy();
    assert.equal((await fetch(`${server.origin}/health`)).status, 200);
    assert.equal((await server.client`SELECT 1 AS alive`)[0]?.alive, 1);
    await Promise.all([server.close(), server.close()]);
    await assert.rejects(fetch(`${server.origin}/health`, { signal: AbortSignal.timeout(1000) }));
    await assert.rejects(server.client`SELECT 1`, /CONNECTION_ENDED|closed|ended/i);
  } finally { await server.close(); }
});
