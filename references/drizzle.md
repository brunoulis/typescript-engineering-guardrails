# Drizzle / SQL persistence profile

- Inspect actual Drizzle version/dialect, schema/migrations, driver, transaction capability and query patterns. Do not assume ORM types imply runtime safety or security.
- Verify authorization/tenant predicates on fetch/update/delete; use DB constraints/foreign keys/unique indexes to protect invariants where appropriate.
- Never spread untrusted request objects into `.set()` or `.values()` without allowlisting writable fields. Validate raw SQL and dynamic identifiers; use parameterization and dialect conventions.
- Related state transitions generally need a transaction or explicitly designed outbox/saga. Audit isolation/retries and external side effects; do not send email in transaction without reason. Test rollback and duplicate request/idempotency behavior.
- Detect N+1, unbounded result sets, huge offset pagination, accidental `SELECT *`, missing indexes on observed queries; use EXPLAIN and real data before claiming perf improvements.
- Treat Drizzle schema type, DB schema, wire DTO and domain model as different *only when semantics differ*; avoid explosion of redundant types.
- Avoid generic repository wrappers over Drizzle unless genuine boundary/test benefits justify indirection.
- Sources: https://orm.drizzle.team/docs/transactions ; https://orm.drizzle.team/docs/joins
