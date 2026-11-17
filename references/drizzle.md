# Drizzle persistence profile

Drizzle is an ORM-specific layer. Load [PostgreSQL](postgresql.md) when that server is actually used and [TimescaleDB](timescaledb.md) only when extension usage is identified. SQL constraints, isolation, role/RLS behavior, pool budgets and operational migrations belong to those modules regardless of ORM choice.

- Verify installed Drizzle version, dialect, driver, adapter/plugins, schema/migrations and transaction support before changing APIs. Type inference does not validate external input or authorization.
- Put tenant/owner predicates in the actual read/update/delete operation. Use tenant-aware PK/FK/UNIQUE/CHECK invariants where the business contract requires them, and test with an effective restricted role.
- Parse unknown HTTP data into an explicit writable-field schema; pass allowlisted values to `.values()`/`.set()`. Do not spread an entire request object into persistence.
- Keep related task/outbox operations on the callback's Drizzle transaction object. Do not route one operation through a global database/pool or perform prolonged external I/O while holding the transaction. Prove rollback under actual database failure and concurrency against the real driver.
- Check bounded pagination, deterministic ordering, N+1 and selected columns. Use real plans/data before proposing indexes or caching; a SELECT without LIMIT is not universally defective.
- Keep DB schema, wire DTO and domain types separate only when their semantics differ. Prefer inferred row types where appropriate; avoid generic repository wrappers or duplicated interfaces without a concrete boundary.

## Executed integrations

The [PostgreSQL backend](../examples/postgres-backend/README.md) pins Drizzle **0.45.4**, postgres.js **4.1.1** and Better Auth/adapter **1.7.25**. Real HTTP tests establish session-backed membership, owner/tenant predicates, strict writable fields, same-key concurrent uniqueness arbitration and a single Drizzle transaction for task plus outbox. A real PostgreSQL CHECK failure causes rollback. The app login cannot change membership, read the outbox or create schema objects. This example uses explicit SQL authorization; it does not claim RLS.

The independent [data package](../examples/data/README.md) pins Drizzle **0.45.4** for Node/TimescaleDB operations: bounded parameterized hypertable insertion/reading and explicit aggregate refresh/consumption. A separate effective-role fixture proves aggregate isolation through a restricted fixed-tenant view. Drizzle does not model every extension policy or prove that an aggregate inherits raw-table RLS.

Framework detector `.set(request)` and missing-predicate leads remain import-aware, limited heuristics; see [framework signals](framework-signals.md). AST shape cannot establish an authorization bypass, transaction requirement, full wrapper semantics or SQL cost.

Official sources: [Drizzle transactions](https://orm.drizzle.team/docs/transactions), [joins](https://orm.drizzle.team/docs/joins), [0.45.4 postgres.js session implementation](https://github.com/drizzle-team/drizzle-orm/blob/0.45.4/drizzle-orm/src/postgres-js/session.ts) and [0.45.4 node-postgres driver](https://github.com/drizzle-team/drizzle-orm/blob/0.45.4/drizzle-orm/src/node-postgres/driver.ts). Tagged source/declarations and executed tests establish the recorded API compatibility; current documentation alone does not.
