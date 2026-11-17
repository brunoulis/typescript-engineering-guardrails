import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../schema.js';
import type { Actor } from './types/actor.js';

type Database = PostgresJsDatabase<typeof schema>;
const fields = { id: schema.task.id, tenantId: schema.task.tenantId, ownerId: schema.task.ownerId, title: schema.task.title };
const owned = (actor: Actor) => and(eq(schema.task.tenantId, actor.tenantId), eq(schema.task.ownerId, actor.userId),
  sql`EXISTS (SELECT 1 FROM ${schema.membership} WHERE ${schema.membership.tenantId} = ${actor.tenantId} AND ${schema.membership.userId} = ${actor.userId})`);

export async function createTask(db: Database, actor: Actor, title: string, key: string) {
  const hash = createHash('sha256').update(JSON.stringify({ title })).digest('hex');
  return db.transaction(async (tx) => {
    const member = await tx.select({ userId: schema.membership.userId }).from(schema.membership)
      .where(and(eq(schema.membership.tenantId, actor.tenantId), eq(schema.membership.userId, actor.userId)));
    if (!member.length) return { kind: 'forbidden' as const };
    const [created] = await tx.insert(schema.task).values({
      id: randomUUID(), tenantId: actor.tenantId, ownerId: actor.userId, title, idempotencyKey: key, requestHash: hash,
    }).onConflictDoNothing({ target: [schema.task.tenantId, schema.task.ownerId, schema.task.idempotencyKey] }).returning(fields);
    if (!created) {
      // READ COMMITTED takes a new snapshot after the unique constraint waits for its winner.
      const [existing] = await tx.select({ ...fields, requestHash: schema.task.requestHash }).from(schema.task)
        .where(and(owned(actor), eq(schema.task.idempotencyKey, key)));
      if (!existing) throw new Error('Idempotency winner missing');
      if (existing.requestHash !== hash) return { kind: 'conflict' as const };
      const { requestHash: _requestHash, ...task } = existing;
      return { kind: 'ok' as const, task, replayed: true };
    }
    await tx.insert(schema.outbox).values({ id: randomUUID(), taskId: created.id, tenantId: actor.tenantId,
      event: 'task.created', payload: { taskId: created.id, title } });
    return { kind: 'ok' as const, task: created, replayed: false };
  }, { isolationLevel: 'read committed' });
}

export function listTasks(db: Database, actor: Actor, limit: number, cursor: string | undefined) {
  return db.select(fields).from(schema.task).where(and(owned(actor), cursor ? gt(schema.task.id, cursor) : undefined))
    .orderBy(asc(schema.task.id)).limit(limit);
}
export async function readTask(db: Database, actor: Actor, id: string) {
  const [row] = await db.select(fields).from(schema.task).where(and(owned(actor), eq(schema.task.id, id))).limit(1);
  return row;
}
export async function updateTask(db: Database, actor: Actor, id: string, title: string) {
  const [row] = await db.update(schema.task).set({ title }).where(and(owned(actor), eq(schema.task.id, id))).returning(fields);
  return row;
}

