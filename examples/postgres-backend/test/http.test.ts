import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout } from 'node:timers/promises';
import test from 'node:test';
import { createAdaptorServer } from '@hono/node-server';
import postgres from 'postgres';
import { z } from 'zod';
import { createBackend } from '../src/app.js';
import { assertLocalTestDatabase, requiredEnvironment } from '../src/config.js';
import { migrateDatabase } from '../src/migrate.js';

const userResponse = z.object({ user: z.object({ id: z.string(), email: z.string() }) });
const taskResponse = z.object({ task: z.object({ id: z.uuid(), tenantId: z.uuid(), ownerId: z.string(), title: z.string() }), replayed: z.boolean() });
const password = 'Local-test-password!12345';

test('real HTTP sessions and PostgreSQL authorization, idempotency and rollback', { timeout: 60_000 }, async (t) => {
  const migrationUrl = requiredEnvironment('BACKEND_MIGRATION_DATABASE_URL');
  const appUrl = requiredEnvironment('BACKEND_TEST_DATABASE_URL');
  assertLocalTestDatabase(migrationUrl); assertLocalTestDatabase(appUrl);
  await migrateDatabase(migrationUrl);
  const fixture = postgres(migrationUrl, { max: 3, connect_timeout: 3 });
  const server = createAdaptorServer({ fetch: (request) => handler(request), hostname: '127.0.0.1' });
  let handler: (request: Request) => Response | Promise<Response> = () => new Response('starting', { status: 503 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const backend = createBackend({ databaseUrl: appUrl, origin, secret: 'local-test-only-752a0e831cb55e0129eb35d0cd7e' });
  handler = (request) => backend.app.fetch(request);
  const runId = randomUUID();
  const tenantA = randomUUID(), tenantB = randomUUID();
  const users: string[] = [];
  const request = (path: string, cookie = '', method = 'GET', body?: unknown, extra: Record<string, string> = {}) => fetch(`${origin}${path}`, {
    method, headers: { origin, cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5_000),
  });
  async function signUp(name: string) {
    const email = `${name}-${runId}@example.test`;
    const response = await request('/api/auth/sign-up/email', '', 'POST', { email, name, password });
    assert.equal(response.status, 200);
    const user = userResponse.parse(await response.json()).user;
    users.push(user.id);
    const setCookie = response.headers.getSetCookie().find((value) => value.startsWith('better-auth.session_token='));
    assert.ok(setCookie); assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /SameSite=Lax/i);
    const cookie = setCookie.split(';')[0]; assert.ok(cookie);
    return { ...user, cookie, email };
  }
  try {
    const alice = await signUp('alice'), bob = await signUp('bob'), charlie = await signUp('charlie');
    await fixture`INSERT INTO tenant(id, name) VALUES (${tenantA}, 'A'), (${tenantB}, 'B')`;
    await fixture`INSERT INTO membership(tenant_id, user_id) VALUES (${tenantA}, ${alice.id}), (${tenantA}, ${bob.id}), (${tenantB}, ${charlie.id})`;
    const path = `/tenants/${tenantA}/tasks`;
    let taskId = '';

    await t.test('signup persists password hash, login creates session and actual session HTTP resolves user', async () => {
      const hashes = await fixture`SELECT password FROM auth_account WHERE user_id = ${alice.id}`;
      assert.equal(hashes.length, 1); assert.notEqual(hashes[0]?.password, password);
      const login = await request('/api/auth/sign-in/email', '', 'POST', { email: alice.email, password });
      assert.equal(login.status, 200);
      assert.ok(login.headers.getSetCookie().some((value) => value.startsWith('better-auth.session_token=')));
      const session = await request('/api/auth/get-session', alice.cookie);
      assert.equal(session.status, 200); assert.equal(userResponse.parse(await session.json()).user.id, alice.id);
      const badPassword = await request('/api/auth/sign-in/email', '', 'POST', { email: alice.email, password: 'incorrect-password' });
      assert.equal(badPassword.status, 401);
    });
    await t.test('missing session and forged identity headers are rejected over HTTP', async () => {
      assert.equal((await request(path, '', 'GET', undefined, { 'x-user-id': alice.id, 'x-tenant-id': tenantA })).status, 401);
    });
    await t.test('owner creates one task and one outbox entry', async () => {
      const response = await request(path, alice.cookie, 'POST', { title: 'first task' }, { 'idempotency-key': 'first' });
      assert.equal(response.status, 201);
      const value = taskResponse.parse(await response.json()); taskId = value.task.id;
      assert.equal(value.task.ownerId, alice.id); assert.equal(value.task.tenantId, tenantA); assert.equal(value.replayed, false);
      const events = await fixture`SELECT task_id, tenant_id FROM outbox WHERE task_id = ${taskId}`;
      assert.equal(events.length, 1); assert.equal(events[0]?.tenant_id, tenantA);
    });
    await t.test('same tenant different owner cannot read or update another actor task', async () => {
      assert.equal((await request(`${path}/${taskId}`, bob.cookie)).status, 404);
      assert.equal((await request(`${path}/${taskId}`, bob.cookie, 'PATCH', { title: 'stolen' })).status, 404);
      const list = await request(path, bob.cookie); assert.equal(list.status, 200);
      assert.deepEqual(await list.json(), { tasks: [] });
    });
    await t.test('tenant selection is checked against persisted membership, including revocation', async () => {
      const foreignPath = `/tenants/${tenantB}/tasks`;
      assert.equal((await request(foreignPath, alice.cookie, 'GET', undefined, { 'x-tenant-id': tenantA })).status, 403);
      assert.equal((await request(`${path}/${taskId}`, charlie.cookie)).status, 403);
      assert.equal((await request(`${foreignPath}/${taskId}`, charlie.cookie)).status, 404);
      await fixture`INSERT INTO membership(tenant_id,user_id) VALUES (${tenantB},${alice.id})`;
      assert.equal((await request(foreignPath, alice.cookie)).status, 200);
      await fixture`DELETE FROM membership WHERE tenant_id=${tenantB} AND user_id=${alice.id}`;
      assert.equal((await request(foreignPath, alice.cookie)).status, 403);
    });
    await t.test('immutable fields, malformed payloads and unbounded pagination are rejected', async () => {
      for (const body of [{ title: 'bad', ownerId: bob.id }, { title: 'bad', tenantId: tenantB }, { title: 'bad', id: randomUUID() }, { title: '' }]) {
        assert.equal((await request(`${path}/${taskId}`, alice.cookie, 'PATCH', body)).status, 400);
        assert.equal((await request(path, alice.cookie, 'POST', body, { 'idempotency-key': randomUUID() })).status, 400);
      }
      assert.equal((await request(`${path}?limit=100000`, alice.cookie)).status, 400);
      assert.equal((await request(`${path}?cursor=bad`, alice.cookie)).status, 400);
      assert.equal((await request(path, alice.cookie, 'POST', { title: 'no key' })).status, 400);
      assert.equal((await request(path, alice.cookie, 'POST', { title: 'x'.repeat(17 * 1024) }, { 'idempotency-key': 'large' })).status, 413);
      const malformed = await fetch(`${origin}${path}`, { method: 'POST', headers: { cookie: alice.cookie, origin, 'content-type': 'application/json', 'idempotency-key': 'malformed' }, body: '{', signal: AbortSignal.timeout(5000) });
      assert.equal(malformed.status, 400);
      const updated = await request(`${path}/${taskId}`, alice.cookie, 'PATCH', { title: 'updated title' });
      assert.equal(updated.status, 200);
      const row = await fixture`SELECT owner_id, tenant_id, title FROM task WHERE id=${taskId}`;
      assert.equal(row[0]?.title, 'updated title'); assert.equal(row[0]?.owner_id, alice.id); assert.equal(row[0]?.tenant_id, tenantA);
    });
    await t.test('untrusted origins are denied for auth and cookie-authenticated writes', async () => {
      assert.equal((await request('/api/auth/sign-in/email', '', 'POST', { email: alice.email, password }, { origin: 'https://evil.example' })).status, 403);
      assert.equal((await request(path, alice.cookie, 'POST', { title: 'csrf' }, { origin: 'https://evil.example', 'idempotency-key': 'csrf' })).status, 403);
      assert.equal((await request(path, alice.cookie, 'POST', { title: 'csrf' }, { origin: '', 'idempotency-key': 'csrf' })).status, 403);
    });
    await t.test('same-key concurrent HTTP writes commit exactly one task and event, with conflict on changed body', async () => {
      // Hold real distinct PostgreSQL backends at INSERT before releasing them together.
      // This fixture belongs only to the dedicated backend database, never application code.
      await fixture`CREATE FUNCTION fixture_task_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.idempotency_key = 'racing' THEN PERFORM pg_advisory_xact_lock(794417262); END IF; RETURN NEW; END $$`;
      await fixture`CREATE TRIGGER fixture_task_gate BEFORE INSERT ON task FOR EACH ROW EXECUTE FUNCTION fixture_task_gate()`;
      const gate = await fixture.reserve();
      await gate`SELECT pg_advisory_lock(794417262)`;
      const pending = Promise.all(Array.from({ length: 8 }, () => request(path, alice.cookie, 'POST', { title: 'racing' }, { 'idempotency-key': 'racing' })));
      let responses: Response[];
      try {
        const deadline = Date.now() + 2000;
        let blocked = 0;
        while (blocked < 2 && Date.now() < deadline) {
          const rows = await fixture`SELECT count(DISTINCT pid)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND application_name='guardrails_backend' AND wait_event='advisory'`;
          blocked = Number(rows[0]?.count ?? 0);
          if (blocked < 2) await setTimeout(10);
        }
        assert.ok(blocked >= 2, 'At least two independent PostgreSQL connections must overlap at the INSERT barrier');
      } finally {
        await gate`SELECT pg_advisory_unlock(794417262)`;
        gate.release();
        try { responses = await pending; }
        finally {
          await fixture`DROP TRIGGER fixture_task_gate ON task`;
          await fixture`DROP FUNCTION fixture_task_gate()`;
        }
      }
      assert.equal(responses.filter((response) => response.status === 201).length, 1);
      assert.equal(responses.filter((response) => response.status === 200).length, 7);
      const values = await Promise.all(responses.map(async (response) => taskResponse.parse(await response.json())));
      assert.equal(new Set(values.map((value) => value.task.id)).size, 1);
      const counts = await fixture`SELECT (SELECT count(*)::int FROM task WHERE tenant_id=${tenantA} AND owner_id=${alice.id} AND idempotency_key='racing') AS tasks, (SELECT count(*)::int FROM outbox WHERE task_id=${values[0]?.task.id ?? ''}::uuid) AS events`;
      assert.equal(counts[0]?.tasks, 1); assert.equal(counts[0]?.events, 1);
      assert.equal((await request(path, alice.cookie, 'POST', { title: 'changed' }, { 'idempotency-key': 'racing' })).status, 409);
      const bobResponse = await request(path, bob.cookie, 'POST', { title: 'racing' }, { 'idempotency-key': 'racing' });
      assert.equal(bobResponse.status, 201); // key namespace includes verified owner
    });
    await t.test('real PostgreSQL outbox constraint failure rolls back task and idempotency claim', async () => {
      await fixture`ALTER TABLE outbox ADD CONSTRAINT fixture_outbox_failure CHECK (false) NOT VALID`;
      try {
        assert.equal((await request(path, alice.cookie, 'POST', { title: 'rollback' }, { 'idempotency-key': 'rollback' })).status, 500);
        const rows = await fixture`SELECT count(*)::int AS count FROM task WHERE tenant_id=${tenantA} AND idempotency_key='rollback'`;
        assert.equal(rows[0]?.count, 0);
      } finally { await fixture`ALTER TABLE outbox DROP CONSTRAINT fixture_outbox_failure`; }
      assert.equal((await request(path, alice.cookie, 'POST', { title: 'rollback' }, { 'idempotency-key': 'rollback' })).status, 201);
    });
    await t.test('expired and revoked database sessions cannot access tasks', async () => {
      await fixture`UPDATE auth_session SET expires_at=now()-interval '1 day' WHERE user_id=${alice.id}`;
      assert.equal((await request(path, alice.cookie)).status, 401);
      await fixture`DELETE FROM auth_session WHERE user_id=${bob.id}`;
      assert.equal((await request(path, bob.cookie)).status, 401);
    });
    await t.test('effective app role cannot grant membership, read outbox or create tables', async () => {
      const role = await backend.client`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user`;
      assert.equal(role[0]?.rolsuper, false); assert.equal(role[0]?.rolbypassrls, false);
      await assert.rejects(backend.client`INSERT INTO membership(tenant_id,user_id) VALUES (${tenantB},${bob.id})`, (error: unknown) => error instanceof postgres.PostgresError && error.code === '42501');
      await assert.rejects(backend.client`SELECT * FROM outbox`, (error: unknown) => error instanceof postgres.PostgresError && error.code === '42501');
      await assert.rejects(backend.client`CREATE TABLE forbidden_app_table(id int)`, (error: unknown) => error instanceof postgres.PostgresError && error.code === '42501');
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await backend.close();
    try {
      await fixture`DELETE FROM task WHERE tenant_id IN (${tenantA}, ${tenantB})`;
      await fixture`DELETE FROM tenant WHERE id IN (${tenantA}, ${tenantB})`;
      for (const id of users) await fixture`DELETE FROM auth_user WHERE id=${id}`;
    } finally { await fixture.end({ timeout: 5 }); }
  }
});
