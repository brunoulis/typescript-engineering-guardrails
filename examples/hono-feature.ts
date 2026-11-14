// Illustrative design only; adapt to the installed Hono/Zod/Drizzle versions.
// Keep business rule testable and HTTP concerns at edge.
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

const createSchema = z.object({ title: z.string().trim().min(1).max(120) })
type CreateInput = z.infer<typeof createSchema>
type Actor = { id: string; tenantId: string }

type Dependencies = {
  authenticate: (request: Request) => Promise<Actor | null>
  createTask: (actor: Actor, input: CreateInput) => Promise<{ id: string; title: string }>
}

export function taskRoutes(deps: Dependencies) {
  const app = new Hono()
  app.post('/', zValidator('json', createSchema), async (c) => {
    const actor = await deps.authenticate(c.req.raw)
    if (!actor) return c.json({ error: 'UNAUTHORIZED' }, 401)
    // createTask must scope data to actor.tenantId; passing actor alone is not a substitute for checking.
    const task = await deps.createTask(actor, c.req.valid('json'))
    return c.json(task, 201)
  })
  return app
}
