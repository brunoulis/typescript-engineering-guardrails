import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createApp } from '../src/app.ts';

// TEST ONLY: fixed tokens stand in for an already verified authentication result.
// This is not a JWT verifier, session implementation, or Better Auth adapter.
const principals = new Map([
  ['alice-a', { actorId: 'alice', tenantId: 'tenant-a' }],
  ['bob-a', { actorId: 'bob', tenantId: 'tenant-a' }],
  ['alice-b', { actorId: 'alice', tenantId: 'tenant-b' }],
]);

function fixture(t: { after: (fn: () => void) => void }) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const app = createApp({
    db,
    authenticate: async (request) =>
      principals.get(request.headers.get('authorization')?.replace('Bearer ', '') ?? '') ?? null,
  });
  function request(method: string, path: string, body?: unknown, token = 'alice-a', key = 'request-1') {
    return app.request(path, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': key },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  return { app, db, request };
}

test('creates a task and its outbox event through HTTP and SQLite', async (t) => {
  const { db, request } = fixture(t);
  const response = await request('POST', '/tasks', { title: 'Ship the report' });
  assert.equal(response.status, 201);
  const task = await response.json();
  assert.equal(task.title, 'Ship the report');
  assert.equal(task.completed, false);
  assert.match(task.id, /^[0-9a-f-]{36}$/);
  const stored = db.prepare('SELECT actor_id, tenant_id, title FROM tasks WHERE id = ?').get(task.id);
  assert.deepEqual({ ...stored }, { actor_id: 'alice', tenant_id: 'tenant-a', title: 'Ship the report' });
  const event = db.prepare('SELECT event_type, payload FROM outbox WHERE task_id = ?').get(task.id);
  assert.equal(event?.event_type, 'task.created');
  assert.deepEqual(JSON.parse(String(event?.payload)), task);
  const read = await request('GET', `/tasks/${task.id}`);
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), task);
});

test('requires verified authentication for each task endpoint', async (t) => {
  const { request } = fixture(t);
  for (const [method, path, body] of [
    ['POST', '/tasks', { title: 'x' }],
    ['GET', '/tasks/unknown', undefined],
    ['PATCH', '/tasks/unknown', { title: 'x' }],
  ] as const) {
    assert.equal((await request(method, path, body, 'invalid')).status, 401);
  }
});

test('rejects invalid titles and unknown or immutable create fields', async (t) => {
  const { request } = fixture(t);
  for (const body of [
    {}, { title: '' }, { title: '   ' }, { title: 'x'.repeat(201) }, { title: 3 },
    { title: 'x', id: 'supplied' }, { title: 'x', actorId: 'bob' },
    { title: 'x', tenantId: 'tenant-b' }, { title: 'x', createdAt: 'supplied' },
    { title: 'x', completed: true },
  ]) {
    assert.equal((await request('POST', '/tasks', body)).status, 400, JSON.stringify(body));
  }
});

test('rejects malformed JSON and missing or invalid idempotency keys', async (t) => {
  const { app } = fixture(t);
  for (const [body, key] of [['{', 'valid-key'], ['{"title":"x"}', ''], ['{"title":"x"}', 'bad key'], ['{"title":"x"}', 'x'.repeat(129)]] as const) {
    const response = await app.request('/tasks', {
      method: 'POST',
      headers: { authorization: 'Bearer alice-a', 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
      body,
    });
    assert.equal(response.status, 400);
  }
});

test('isolates reads and updates by both actor and tenant', async (t) => {
  const { request } = fixture(t);
  const task = await (await request('POST', '/tasks', { title: 'Private' })).json();
  for (const token of ['bob-a', 'alice-b']) {
    assert.equal((await request('GET', `/tasks/${task.id}`, undefined, token)).status, 404);
    assert.equal((await request('PATCH', `/tasks/${task.id}`, { title: 'Stolen' }, token)).status, 404);
  }
  const owner = await request('GET', `/tasks/${task.id}`);
  assert.equal((await owner.json()).title, 'Private');
});

test('updates mutable fields while rejecting immutable and unknown fields', async (t) => {
  const { request } = fixture(t);
  const task = await (await request('POST', '/tasks', { title: 'Original' })).json();
  for (const body of [{ title: 'Overwritten', id: 'other' }, { title: 'Overwritten', actorId: 'bob' }, { title: 'Overwritten', tenantId: 'tenant-b' }, { title: 'Overwritten', createdAt: 'now' }, { title: 'Overwritten', surprise: 1 }, {}, { completed: 'yes' }]) {
    assert.equal((await request('PATCH', `/tasks/${task.id}`, body)).status, 400);
  }
  assert.deepEqual(await (await request('GET', `/tasks/${task.id}`)).json(), task);
  const updated = await request('PATCH', `/tasks/${task.id}`, { title: 'Finished', completed: true });
  assert.equal(updated.status, 200);
  assert.deepEqual(await updated.json(), { ...task, title: 'Finished', completed: true });
});

test('replays the original response without another task or event, even after an update', async (t) => {
  const { db, request } = fixture(t);
  const original = await (await request('POST', '/tasks', { title: 'Original' })).json();
  await request('PATCH', `/tasks/${original.id}`, { title: 'Changed later' });
  const replay = await request('POST', '/tasks', { title: 'Original' });
  assert.equal(replay.status, 201);
  assert.deepEqual(await replay.json(), original);
  assert.equal(db.prepare('SELECT count(*) AS n FROM tasks').get()?.n, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM outbox').get()?.n, 1);
});

test('returns conflict when an idempotency key is reused with a different payload', async (t) => {
  const { db, request } = fixture(t);
  await request('POST', '/tasks', { title: 'First' });
  const response = await request('POST', '/tasks', { title: 'Different' });
  assert.equal(response.status, 409);
  const replay = await request('POST', '/tasks', { title: 'First' });
  assert.equal(replay.status, 201);
  assert.equal((await replay.json()).title, 'First');
  assert.equal(db.prepare('SELECT count(*) AS n FROM tasks').get()?.n, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM outbox').get()?.n, 1);
});

test('scopes the same idempotency key independently to actor and tenant', async (t) => {
  const { request } = fixture(t);
  const ids = new Set<string>();
  for (const token of ['alice-a', 'bob-a', 'alice-b']) {
    const response = await request('POST', '/tasks', { title: token }, token, 'shared-key');
    assert.equal(response.status, 201);
    ids.add((await response.json()).id);
  }
  assert.equal(ids.size, 3);
});

test('rolls back task and idempotency state when a real SQLite trigger rejects the outbox write', async (t) => {
  const { db, request } = fixture(t);
  db.exec("CREATE TRIGGER reject_event BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'outbox unavailable'); END");
  const failed = await request('POST', '/tasks', { title: 'Retry safely' });
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: 'internal_error' });
  for (const table of ['tasks', 'outbox', 'idempotency']) {
    assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n, 0, table);
  }
  db.exec('DROP TRIGGER reject_event');
  assert.equal((await request('POST', '/tasks', { title: 'Retry safely' })).status, 201);
  assert.equal(db.prepare('SELECT count(*) AS n FROM outbox').get()?.n, 1);
});

test('coalesces overlapping in-process HTTP creates to one committed task', async (t) => {
  const { db, request } = fixture(t);
  const responses = await Promise.all(Array.from({ length: 8 }, () => request('POST', '/tasks', { title: 'Once' })));
  const tasks = await Promise.all(responses.map(async (response) => {
    assert.equal(response.status, 201);
    return response.json();
  }));
  assert.equal(new Set(tasks.map((task) => task.id)).size, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM tasks').get()?.n, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM outbox').get()?.n, 1);
});
