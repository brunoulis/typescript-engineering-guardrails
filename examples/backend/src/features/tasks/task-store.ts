import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { taskResponseSchema, taskRowSchema } from './schemas/task-schema.ts';
import type { Actor, Task, UpdateTask } from './types/task.ts';

export function initializeTaskDatabase(db: DatabaseSync): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      actor_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL CHECK (json_valid(payload))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS idempotency (
      actor_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      request_key TEXT NOT NULL,
      request_payload TEXT NOT NULL,
      response_payload TEXT NOT NULL CHECK (json_valid(response_payload)),
      PRIMARY KEY (actor_id, tenant_id, request_key)
    ) STRICT;
  `);
}

function taskFromRow(value: unknown): Task {
  const row = taskRowSchema.parse(value);
  return { id: row.id, title: row.title, completed: row.completed === 1, createdAt: row.created_at };
}

export function findTask(db: DatabaseSync, actor: Actor, id: string): Task | undefined {
  const row = db.prepare('SELECT id, title, completed, created_at FROM tasks WHERE id = ? AND actor_id = ? AND tenant_id = ?')
    .get(id, actor.actorId, actor.tenantId);
  return row === undefined ? undefined : taskFromRow(row);
}

export function updateTask(db: DatabaseSync, actor: Actor, id: string, input: UpdateTask): Task | undefined {
  const row = db.prepare(`UPDATE tasks SET title = COALESCE(?, title), completed = COALESCE(?, completed)
    WHERE id = ? AND actor_id = ? AND tenant_id = ? RETURNING id, title, completed, created_at`)
    .get(input.title ?? null, input.completed === undefined ? null : Number(input.completed), id, actor.actorId, actor.tenantId);
  return row === undefined ? undefined : taskFromRow(row);
}

export class IdempotencyConflict extends Error {}

export function createTask(db: DatabaseSync, actor: Actor, title: string, key: string): Task {
  // The validated request has one field: this is a stable semantic representation.
  const requestPayload = JSON.stringify({ title });
  // No await or external operation is allowed between BEGIN and COMMIT/ROLLBACK.
  db.exec('BEGIN IMMEDIATE');
  try {
    const prior = db.prepare(`SELECT request_payload, response_payload FROM idempotency
      WHERE actor_id = ? AND tenant_id = ? AND request_key = ?`).get(actor.actorId, actor.tenantId, key);
    if (prior) {
      if (prior.request_payload !== requestPayload) throw new IdempotencyConflict();
      const task = taskResponseSchema.parse(JSON.parse(String(prior.response_payload)));
      db.exec('COMMIT');
      return task;
    }
    const task: Task = { id: randomUUID(), title, completed: false, createdAt: new Date().toISOString() };
    const responsePayload = JSON.stringify(task);
    db.prepare('INSERT INTO tasks (id, actor_id, tenant_id, title, completed, created_at) VALUES (?, ?, ?, ?, 0, ?)')
      .run(task.id, actor.actorId, actor.tenantId, title, task.createdAt);
    db.prepare(`INSERT INTO idempotency (actor_id, tenant_id, request_key, request_payload, response_payload)
      VALUES (?, ?, ?, ?, ?)`).run(actor.actorId, actor.tenantId, key, requestPayload, responsePayload);
    db.prepare('INSERT INTO outbox (id, task_id, actor_id, tenant_id, event_type, payload) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), task.id, actor.actorId, actor.tenantId, 'task.created', responsePayload);
    db.exec('COMMIT');
    return task;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
