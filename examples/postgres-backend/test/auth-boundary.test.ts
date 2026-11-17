import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackend } from '../src/app.js';

test('missing session cannot use forged identity headers to read tenant tasks', async () => {
  const backend = createBackend({
    databaseUrl: 'postgres://test:test@127.0.0.1:55432/guardrails_backend',
    origin: 'http://127.0.0.1:8787', secret: 'local-test-secret-with-at-least-32-characters',
  });
  try {
    const response = await backend.app.request('/tenants/2f8cc3ce-c0ad-4bac-906f-34c818587341/tasks', {
      headers: { 'x-user-id': 'forged', 'x-tenant-id': '2f8cc3ce-c0ad-4bac-906f-34c818587341' },
    });
    assert.equal(response.status, 401);
  } finally { await backend.close(); }
});
