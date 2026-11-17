import { Hono } from 'hono';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq } from 'drizzle-orm';
import { bodyLimit } from 'hono/body-limit';
import postgres from 'postgres';
import { assertLocalTestDatabase } from './config.js';
import * as schema from './schema.js';
import { createTask, listTasks, readTask, updateTask } from './tasks/tasks.js';
import { identifier, idempotencyKey, listInput, taskInput } from './tasks/schemas/input.js';

export function createBackend(options: { databaseUrl: string; origin: string; secret: string }) {
  assertLocalTestDatabase(options.databaseUrl);
  const client = postgres(options.databaseUrl, { max: 4, connect_timeout: 3, idle_timeout: 10,
    connection: { statement_timeout: 5000, lock_timeout: 3000, idle_in_transaction_session_timeout: 5000, application_name: 'guardrails_backend' } });
  const db = drizzle(client, { schema });
  const auth = betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema, transaction: true }),
    baseURL: options.origin, secret: options.secret, trustedOrigins: [options.origin],
    emailAndPassword: { enabled: true },
    session: { cookieCache: { enabled: false } },
    advanced: { useSecureCookies: new URL(options.origin).protocol === 'https:',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' } },
  });
  const app = new Hono<{ Variables: { actorId: string; tenantId: string } }>();
  app.use('*', bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: 'body_too_large' }, 413) }));
  app.onError((_error, c) => c.json({ error: 'internal_error' }, 500));
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
  app.use('/tenants/*', async (c, next) => {
    const authenticated = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!authenticated) return c.json({ error: 'unauthorized' }, 401);
    c.set('actorId', authenticated.user.id);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && c.req.header('origin') !== options.origin) {
      return c.json({ error: 'forbidden_origin' }, 403);
    }
    const tenantId = identifier.safeParse(c.req.path.split('/')[2]);
    if (!tenantId.success) return c.json({ error: 'invalid_tenant' }, 400);
    const member = await db.select({ userId: schema.membership.userId }).from(schema.membership)
      .where(and(eq(schema.membership.tenantId, tenantId.data), eq(schema.membership.userId, authenticated.user.id))).limit(1);
    if (!member.length) return c.json({ error: 'forbidden' }, 403);
    c.set('tenantId', tenantId.data);
    await next();
  });
  app.get('/tenants/:tenantId/tasks', async (c) => {
    const input = listInput.safeParse(c.req.query());
    if (!input.success) return c.json({ error: 'invalid_query' }, 400);
    const tasks = await listTasks(db, { userId: c.get('actorId'), tenantId: c.get('tenantId') }, input.data.limit, input.data.cursor);
    return c.json({ tasks });
  });
  app.post('/tenants/:tenantId/tasks', async (c) => {
    const key = idempotencyKey.safeParse(c.req.header('idempotency-key'));
    const body = taskInput.safeParse(await c.req.json<unknown>().catch(() => undefined));
    if (!key.success || !body.success) return c.json({ error: 'invalid_input' }, 400);
    const result = await createTask(db, { userId: c.get('actorId'), tenantId: c.get('tenantId') }, body.data.title, key.data);
    if (result.kind === 'forbidden') return c.json({ error: 'forbidden' }, 403);
    if (result.kind === 'conflict') return c.json({ error: 'idempotency_conflict' }, 409);
    return c.json({ task: result.task, replayed: result.replayed }, result.replayed ? 200 : 201);
  });
  app.get('/tenants/:tenantId/tasks/:id', async (c) => {
    const id = identifier.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'invalid_id' }, 400);
    const task = await readTask(db, { userId: c.get('actorId'), tenantId: c.get('tenantId') }, id.data);
    return task ? c.json({ task }) : c.json({ error: 'not_found' }, 404);
  });
  app.patch('/tenants/:tenantId/tasks/:id', async (c) => {
    const id = identifier.safeParse(c.req.param('id'));
    const body = taskInput.safeParse(await c.req.json<unknown>().catch(() => undefined));
    if (!id.success || !body.success) return c.json({ error: 'invalid_input' }, 400);
    const task = await updateTask(db, { userId: c.get('actorId'), tenantId: c.get('tenantId') }, id.data, body.data.title);
    return task ? c.json({ task }) : c.json({ error: 'not_found' }, 404);
  });
  return { app, client, db, close: () => client.end({ timeout: 5 }) };
}


