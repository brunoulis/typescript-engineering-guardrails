import type { z } from 'zod';
import type { taskResponseSchema, updateTaskSchema } from '../schemas/task-schema.ts';

export type Actor = Readonly<{ actorId: string; tenantId: string }>;

export type Task = Readonly<z.infer<typeof taskResponseSchema>>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;

export type TaskEnvironment = { Variables: { actor: Actor } };
