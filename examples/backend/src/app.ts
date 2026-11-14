import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { DatabaseSync } from 'node:sqlite';
import type { Authentication } from './features/tasks/interfaces/authentication.ts';
import { initializeTaskDatabase } from './features/tasks/task-store.ts';
import { taskRoutes } from './features/tasks/task-routes.ts';

export function createApp({ db, authenticate }: {
  db: DatabaseSync;
  authenticate: Authentication;
}) {
  initializeTaskDatabase(db);
  const app = new Hono();
  app.onError((error, context) => {
    if (error instanceof HTTPException && error.status === 400) return context.json({ error: 'invalid_request' }, 400);
    return context.json({ error: 'internal_error' }, 500);
  });
  return app.route('/tasks', taskRoutes(db, authenticate));
}
