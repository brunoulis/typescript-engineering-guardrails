# Backend architecture: context before folders

## Adaptive architecture decision
1. Identify features/domains and who changes them together (cohesion), shared data, release units, external interfaces and target team size.
2. Compare flat small app, feature folders with colocated files, feature modules with internal layers, packages/workspaces, and services. Move outward only if actual coupling, deployment independence, team ownership or test isolation justifies it. LOC thresholds are not architecture evidence.
3. Prefer feature-centric folders once locating behavior by business capability becomes easier than global `controllers/services/models` directories. Don't blindly restructure functioning small code.
4. Keep composition root near entrypoint; inject real external dependencies where testability or lifetime matters. Avoid class-based DI boilerplate for pure functions.
5. Domain functions should be usable without HTTP framework. Route binds validation, auth, status codes and error serialization. Explicitly decide if simple route CRUD warrants service extraction.
6. Shared code must have *true shared semantics* and a stable contract, not just similar text. Avoid `utils`, `helpers`, mega `types` dumping grounds or cross-domain imports of internals.
7. Shared monorepo contracts should not leak DB row types or auth session internals into clients; map to stable DTO when coupling is harmful.

## Positive example for medium Hono API (illustrative, adaptable convention)

```text
src/
  app/{app.ts,dependencies.ts}
  modules/
    orders/
      routes.ts
      service.ts               # when business orchestration justifies it
      queries.ts
      schemas/order.schema.ts  # validation runtime
      types/order.types.ts     # aliases, unions, branded IDs
      interfaces/order-repository.interface.ts  # when there is a real port/contract
      constants/order.constants.ts
    users/
      routes.ts
      queries.ts
      schemas/user.schema.ts
      types/user.types.ts
      interfaces/user-profile.interface.ts
      constants/user.constants.ts
  auth/auth.ts
  db/{client.ts,schema/}
  shared/
    errors.ts
    observability.ts
    types/                   # genuinely cross-feature only
    interfaces/
    constants/
```

The `types/`, `interfaces/` and `constants/` folders are the preferred organization when those definitions exist; do not create empty folders or placeholder files. An order requiring multi-table atomic transitions may need `service.ts`; a read-only user lookup may not. Each module owns its API, validation, business rules and data access boundaries. A `repository` interface is appropriate if it protects a real domain rule from multiple persistence implementations or makes complex tests straightforward; not for the sake of clean-architecture diagrams. See `code-organization.md`.

## Gate for extraction
Ask: What changes together? How many consumers? Does extraction reduce meaningful coupling? Is there a stable interface? What extra files/indirection does it cost? Can an internal function suffice? Will call direction remain acyclic? If evidence insufficient, document deferred extraction.
