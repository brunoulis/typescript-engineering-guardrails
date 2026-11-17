import { z } from 'zod';

export const taskInput = z.object({ title: z.string().trim().min(1).max(120) }).strict();
export const identifier = z.uuid();
export const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
export const listInput = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.uuid().optional(),
}).strict();
