# Executable evidence and counterexamples

## HTTP/database behavior

[Backend package](../examples/backend/README.md) uses Hono, Zod and real SQLite through `node:sqlite`. Its feature owns `types/`, `interfaces/`, `constants/` and `schemas/`. Run `npm ci --ignore-scripts` and `npm run check` in that directory with the documented Node version.

Its tests verify HTTP statuses and stored state for invalid input, absent/invalid identity, actor and tenant isolation, immutable fields, idempotent replay, conflicting payloads and rollback when an outbox trigger rejects a write. The authentication port accepts an already verified actor; test tokens are only fixtures. This does not implement Better Auth, a Drizzle adapter, remote database behavior, full production hardening or distributed delivery.

When adapting it: preserve the existing authentication and persistence integrations, put ownership predicates in the actual operation, keep external side effects outside the transaction, and write tests against the project's real driver. Do not copy its fresh-schema initialization as a production migration system.

## Real PostgreSQL authentication backend

The independent [PostgreSQL backend](../examples/postgres-backend/README.md) uses Hono 4.13.19, Better Auth/adapter 1.7.25, Drizzle 0.45.4 and postgres.js 4.1.1. Installed metadata/lock and tagged source/declarations were compared before implementation. Node 24.22.1 against PostgreSQL 17.6 recorded **17 passing tests, zero skips** on 2026-11-16.

These tests use a real HTTP listener and database: password signup/login/session cookies, missing/expired/revoked sessions, persisted memberships, owner/tenant predicates, immutable fields, origin rejection and bounded inputs. An advisory-lock INSERT barrier holds at least two distinct PostgreSQL backends before releasing eight same-key requests; one task and one outbox event commit. A real outbox CHECK failure returns 500, leaves no task/idempotency claim, then permits a successful retry after removal. The app uses an effective restricted login; fixture DDL uses the separate migration connection. Cancellation, listener closure and ended-pool behavior are exercised.

This is a local fixture, not production deployment evidence. It does not claim RLS, outbox delivery, cross-runtime auth compatibility or distributed exactly-once behavior. Its membership FK prevents deleting grants referenced by existing tasks; an administrative suspension/archival model is a separate extension.

## PostgreSQL and TimescaleDB data matrix

The [data package](../examples/data/README.md) records actual Node 24.22.1, Bun 1.3.10 and Deno 2.9.8 execution against pinned Linux/amd64 containers on Windows Docker Desktop, with PostgreSQL 17.6 and TimescaleDB 2.22.1. It owns a separate lock and postgres.js **3.4.7**, rather than assuming the backend package's driver version.

- Node + pg exercises constraints, same-acquired-client rollback, distinct concurrent clients, atomic updates, timeout/recovery, migration compatibility, EXPLAIN and effective-role RLS, including transaction-local tenant context reuse after rollback/commit.
- Node + pg exercises actual Timescale partition-inclusive uniqueness, bucket boundaries/DST, late historical arrivals and refresh, real-time tails, columnstore conversion and fidelity, policy configuration, safe retention and the destructive refresh-after-deletion counterexample.
- Node + Drizzle exercises bounded parameterized hypertable operations and aggregate consumption. Aggregate isolation uses a restricted fixed-tenant security-barrier view; it does not assume continuous aggregates inherit raw-table RLS.
- Actual Bun + postgres.js and Deno + npm postgres.js execute the shared parameterized batch/rollback/error/timeout and Timescale reference contracts. Deno checks types and demonstrates failure without the required environment or network permission.

A deliberate transaction mutation routing through the pool instead of its acquired client caused a partial row to survive and the rollback assertion to fail; restoration returned tests to green. No other driver/runtime combination, production plan/index choice, scheduler reliability or throughput is inferred. See the package README for artifact digests, commands and exact scope; never run destructive fixtures against production.

## Auditor evidence

Maintained auditor sources/tests are strict TypeScript. The generated CommonJS entry preserves the syntax/API compatibility contract, while semantic, quality, baseline/SARIF and controlled integration tests add distinct evidence. See [scanner](scanner.md), [quality dimensions](quality-score.md), [framework integrations](framework-signals.md) and [labeled corpus/measurements](corpus.md). Knip/dependency-cruiser operate on selected-source snapshots and sanitized dependency metadata with tool-owned configuration; dependency candidates are not full-project removal proof. The type-aware typescript-eslint recipe has real positive/negative lint execution. Current aggregate acceptance and hosted CI must be reported from actual runs, independently of historical counts.

## Historical v1.2 pinned upstream source inspection

Historical validation on 2026-11-14 inspected these immutable snapshots with the v1.2 scanner; these are not v2 corpus metrics or the current test count:

| Project | Revision | Scope | Files including tests | Files excluding tests |
|---|---|---|---|---|
| Hono | `f6fbaf0299c48eea9e656e03e2ffe7ac755e8823` | `src` | 314 | 189 |
| Better Auth | `3fa26c979160914ce8e1c0e8786b1f48aa2552e5` | `packages/better-auth/src` | 392 | 281 |

Both scans completed without parse diagnostics with TypeScript 6.0.3. These are source inspections, not execution of upstream test suites or proof of production safety. Counts are scope measurements, not precision/recall estimates.

### What the findings mean in context

- [Better Auth origin-check fixture](https://github.com/better-auth/better-auth/blob/3fa26c979160914ce8e1c0e8786b1f48aa2552e5/packages/better-auth/src/api/middlewares/origin-check.test.ts#L943): security options are deliberately disabled to test distinct behaviors. All eight security-toggle signals in the selected Better Auth corpus are in tests. **Disposition: retain the tests**, not eight production vulnerabilities.
- [Better Auth origin-check fallback](https://github.com/better-auth/better-auth/blob/3fa26c979160914ce8e1c0e8786b1f48aa2552e5/packages/better-auth/src/api/middlewares/origin-check.ts#L26): an empty catch falls through to `return false` from `shouldSkipOriginCheck`. Failure to parse a path does not itself skip the check. **Disposition: retain pending broader context**, no auth bypass established by the empty catch.
- [Hono mount fallback](https://github.com/honojs/hono/blob/f6fbaf0299c48eea9e656e03e2ffe7ac755e8823/src/hono-base.ts#L377): optional execution-context access can throw outside the worker environment; the catch leaves it undefined for the mounted adapter. **Disposition: legitimate fallback retained**, rather than mechanically rethrowing.
- [Hono client type tests](https://github.com/honojs/hono/blob/f6fbaf0299c48eea9e656e03e2ffe7ac755e8823/src/client/client.test.ts#L1724): real directives after complex syntax were missed by the old standalone scanner. Parser-boundary traversal recovers them. **Disposition: review test intent**, not automatic deletion.
- [Better Auth secondary storage](https://github.com/better-auth/better-auth/blob/3fa26c979160914ce8e1c0e8786b1f48aa2552e5/packages/better-auth/src/db/internal-adapter.ts#L439): JSON can be the value of one ternary branch before an assertion. The corrected rule retains this review lead. **Disposition: investigate storage trust/validation**, without declaring corrupted or exploitable data from syntax alone.

Audit-specific raw reports, the pinned manifest, reproduction script, original scanner, test logs and source hashes are kept outside the installable skill at `docs/audits/2026-11-14-typescript/` in the development workspace. Run `node docs/audits/2026-11-14-typescript/reproduce-corpus.cjs --fetch` from that workspace after preparing the skill. Upstream source is neither bundled into the skill nor required for normal use.

Primary API references: [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [Hono request testing](https://hono.dev/docs/guides/testing), [Node SQLite](https://nodejs.org/api/sqlite.html). The installed versions and executable tests, not future documentation changes, define the recorded validation.
