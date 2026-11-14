import { z } from 'zod';
import { MAX_IDEMPOTENCY_KEY_LENGTH, MAX_TITLE_LENGTH } from '../constants/task-limits.ts';

const title = z.string().min(1).max(MAX_TITLE_LENGTH).refine((value) => value.trim().length > 0);
export const createTaskSchema = z.strictObject({ title });
export const updateTaskSchema = z.strictObject({ title: title.optional(), completed: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0);
export const idempotencyKeySchema = z.string().min(1).max(MAX_IDEMPOTENCY_KEY_LENGTH).regex(/^[A-Za-z0-9._:-]+$/);

export const taskRowSchema = z.object({
  id: z.string(), title: z.string(), completed: z.union([z.literal(0), z.literal(1)]), created_at: z.string(),
});

export const taskResponseSchema = z.strictObject({
  id: z.string(), title: z.string(), completed: z.boolean(), createdAt: z.string(),
});
