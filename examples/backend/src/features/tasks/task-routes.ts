import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { DatabaseSync } from 'node:sqlite';
import type { Authentication } from './interfaces/authentication.ts';
import { createTaskSchema, idempotencyKeySchema, updateTaskSchema } from './schemas/task-schema.ts';
import { createTask, findTask, IdempotencyConflict, updateTask } from './task-store.ts';
import type { TaskEnvironment } from './types/task.ts';

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HTTPException(400);
  }
}

export function taskRoutes(db: DatabaseSync, authenticate: Authentication) {
  const routes = new Hono<TaskEnvironment>();
  routes.use('*', async (context, next) => {
    const actor = await authenticate(context.req.raw);
    if (!actor) return context.json({ error: 'unauthorized' }, 401);
    context.set('actor', actor);
    await next();
  });
  routes.post('/', async (context) => {
    const input = createTaskSchema.safeParse(await readJson(context.req.raw));
    const key = idempotencyKeySchema.safeParse(context.req.header('idempotency-key'));
    if (!input.success || !key.success) return context.json({ error: 'invalid_request' }, 400);
    try {
      const task = createTask(db, context.get('actor'), input.data.title, key.data);
      return context.json(task, 201);
    } catch (error) {
      if (error instanceof IdempotencyConflict) return context.json({ error: 'idempotency_conflict' }, 409);
      throw error;
    }
  });
  routes.get('/:id', (context) => {
    const task = findTask(db, context.get('actor'), context.req.param('id'));
    return task ? context.json(task) : context.json({ error: 'not_found' }, 404);
  });
  routes.patch('/:id', async (context) => {
    const input = updateTaskSchema.safeParse(await readJson(context.req.raw));
    if (!input.success) return context.json({ error: 'invalid_request' }, 400);
    const task = updateTask(db, context.get('actor'), context.req.param('id'), input.data);
    return task ? context.json(task) : context.json({ error: 'not_found' }, 404);
  });
  return routes;
}
