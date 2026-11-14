# Code organization: `types/`, `interfaces/`, `constants/` without architecture slop

## Project preference / default convention

When building or extending a modular TypeScript backend, organize reusable declarations in **separate, feature-local folders**:

```text
src/
  modules/
    notifications/
      routes.ts
      service.ts                        # only if useful
      schemas/
        notification.schema.ts         # Zod/Valibot runtime validation
      types/
        notification.types.ts          # unions, aliases, branded IDs, inferred types
      interfaces/
        notification-sender.interface.ts # real outbound port
      constants/
        notification.constants.ts      # runtime status sets, defaults, topic names
    users/
      routes.ts
      schemas/
      types/
      interfaces/
      constants/
  shared/
    types/                             # only when truly cross-feature
    interfaces/
    constants/
```

This is a *location preference*, not an order to create every file or a new interface per function. Do not generate empty folders. For tiny features, a nearby single file may remain preferable unless the user asks for strict separation. Preserve existing repo organization during narrow bugfixes.

## Rules for each folder

### `types/`: aliases, transformations and domain variants
- Type aliases (`type UserId = string & { readonly __brand: unique symbol }`), unions, discriminated unions, generics, mapped types, DTO types derived from schemas, and aliases to external types.
- Prefer `z.infer<typeof schema>`, Drizzle `$inferSelect`/`$inferInsert` or equivalent from the single authoritative schema rather than manually reproducing fields. Import a schema **as a type source only when the dependency graph remains appropriate**; use `import type` for generated aliases where possible.
- Do not place input validation or actual JS constants here, and do not call unsafe casts validation.

### `interfaces/`: meaningful object contracts and ports
- Declare stable object-shaped contracts, dependency ports, service/provider interfaces, adapters and lifecycle contracts **when they express a real boundary**. Plain domain object interfaces are also fine when consistent with the repo.
- Do not force `interface IUsersService` for each `UsersService`. A function type or inferred return type may be clearer. Avoid abstract bases and generics created solely to populate this folder.
- Consistent file naming (`user-repository.interface.ts` or `user-repository.ts`) matters more than prefixing every name with `I`. Use `import type` and `export type` where suitable to avoid runtime imports and accidental cycles.

### `constants/`: runtime values and policies
- `as const` status sets, well-scoped event names, domain limits, fixed headers, topic identifiers, immutable mapping tables and protocol values. Make values `readonly`/`as const` where useful, deriving unions if needed:

```ts
// constants/notification.constants.ts
export const NOTIFICATION_CHANNELS = ['email', 'push', 'in_app'] as const

// types/notification.types.ts
import type { NOTIFICATION_CHANNELS } from '../constants/notification.constants'
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]
```

- Do **not** put environment secrets, changing config, mutable caches, live clients or auth tokens in constant modules. Validate environment variables in `config/` and inject resolved config where lifecycle/testability matters. Avoid mega `constants/index.ts` dumps.

### `schemas/` (separate): runtime truth
- A TypeScript interface is erased at runtime. Hono request bodies, Better Auth callbacks, queue messages and external JSON require the right runtime checks. Put Zod/Valibot/Standard Schema validators in `schemas/` and derive types where appropriate.
- Keep stable HTTP DTOs distinct from DB row types when exposing persistence internals would create risk or coupling. Reuse types only when semantics and lifecycle genuinely match.

## Dependency direction, exports and imports
- Modules own their declarations. `shared/*` requires a real second consumer and stable shared meaning, not similar spellings.
- Avoid feature A importing internals from feature B; expose a deliberate contract, not a barrel exporting everything.
- Avoid circular imports and barrels that trigger side effects. Use type-only imports when possible, and verify toolchain handling of `verbatimModuleSyntax`/ESM under the actual Node/Bun/Deno setup.
- Never force all interfaces into a single global `src/interfaces` disconnected from feature ownership; feature-local separation is preferable. For a small single-domain app, top-level `types/`, `interfaces/`, `constants/` may be reasonable.

## Review checklist for agents
1. Is it owned by the correct feature? Is there a reason to promote it to `shared`?
2. Is this a `type`, `interface`, runtime `constant`, or runtime `schema`?
3. Are we duplicating a contract that already has an authoritative schema?
4. Does the interface represent a real boundary or exist only to imitate Java/C# architecture?
5. Did this change create a cycle or expose domain internals?
6. Could a neighboring simpler design preserve behavior with less indirection?
7. Are the folders populated naturally, without empty scaffolding?

## Refactors of existing folders
- First map usage/imports and public contracts; avoid wholesale folder rearrangements during unrelated work.
- Move definitions in small mechanical commits, keep stable re-exports temporarily if consumers depend on paths, run `tsc` and tests, inspect actual emitted JS/import behavior in the target runtime.
- Separating declarations into directories is a legitimate stated team preference; do not downgrade it as "slop" merely because it adds a directory. The anti-slop gate applies to *invented abstractions and duplication*, not the folder organization itself.
