import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

// Better Auth 1.7.25 core schema; property names are the adapter's field mapping.
export const user = pgTable('auth_user', {
  id: text().primaryKey(), name: text().notNull(), email: text().notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false), image: text(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const session = pgTable('auth_session', {
  id: text().primaryKey(), token: text().notNull().unique(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'), userAgent: text('user_agent'),
}, (table) => [index('auth_session_user_idx').on(table.userId)]);
export const account = pgTable('auth_account', {
  id: text().primaryKey(), accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text(), password: text(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [unique('auth_account_provider_key').on(table.providerId, table.accountId), index('auth_account_user_idx').on(table.userId)]);
export const verification = pgTable('auth_verification', {
  id: text().primaryKey(), identifier: text().notNull(), value: text().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('auth_verification_identifier_idx').on(table.identifier)]);

export const tenant = pgTable('tenant', { id: uuid().primaryKey(), name: text().notNull() });
export const membership = pgTable('membership', {
  tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [primaryKey({ columns: [table.tenantId, table.userId] })]);
export const task = pgTable('task', {
  id: uuid().primaryKey(), tenantId: uuid('tenant_id').notNull().references(() => tenant.id),
  ownerId: text('owner_id').notNull().references(() => user.id), title: text().notNull(),
  idempotencyKey: text('idempotency_key').notNull(), requestHash: text('request_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [unique('task_idempotency_key').on(table.tenantId, table.ownerId, table.idempotencyKey),
  unique('task_tenant_key').on(table.tenantId, table.id),
  foreignKey({ name: 'task_owner_membership', columns: [table.tenantId, table.ownerId], foreignColumns: [membership.tenantId, membership.userId] }),
  check('task_title_check', sql`length(${table.title}) BETWEEN 1 AND 120`),
  check('task_idempotency_key_check', sql`length(${table.idempotencyKey}) BETWEEN 1 AND 80`),
  index('task_list_idx').on(table.tenantId, table.ownerId, table.id)]);
export const outbox = pgTable('outbox', {
  id: uuid().primaryKey(), taskId: uuid('task_id').notNull().unique().references(() => task.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull(), event: text().notNull(), payload: jsonb().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [foreignKey({ name: 'outbox_task_tenant', columns: [table.tenantId, table.taskId], foreignColumns: [task.tenantId, task.id] }),
  check('outbox_event_check', sql`${table.event} = 'task.created'`)]);
