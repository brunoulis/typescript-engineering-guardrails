import type { Actor } from '../types/task.ts';

/** Resolve a verified identity and authorized tenant; never trust caller identity headers. */
export interface Authentication {
  (request: Request): Promise<Actor | null>;
}
