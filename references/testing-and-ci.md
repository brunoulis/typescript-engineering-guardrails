# Verification strategy and evidence gates

Choose checks from the actual change boundary. Capture status, deployed versions, invariants and known failures first. Typecheck/lint/focused tests provide quick feedback; critical authentication, tenancy, transaction, migration and lifecycle changes require actual HTTP/database execution with negative cases. Use the project's tools without automatic upgrades or replacements.

A useful report gives commands and exits, installed/runtime/server versions, scope, diagnostics, failures/skips and untested areas. `COMPLETE` selected analysis, a written workflow and passing application tests are distinct facts.

## Bundled auditor

Prepare in the skill folder: `npm ci --ignore-scripts` then `npm run build`. The whole dependency set requires Node >=22.13.0; local full checks use 24.22.1 and TypeScript 6.0.3. Maintained source is `tool/**/*.ts`; compiled output and the generated legacy CLI are disposable build products.

| Command | Evidence |
| --- | --- |
| `npm run check` | Strict root TypeScript checking without emit |
| `npm test` | Build and compiled tests: syntax compatibility, typed context, graph/quality, config/baseline/SARIF and real pinned external tools |
| `npm run verify` | Root checks/tests plus independently installed Hono/SQLite checks |
| `npm run test:corpus` | Labeled leads/counterexamples, without general production precision claims |
| `npm run benchmark` | Defined auditor workloads, elapsed-time/memory measurements under recorded conditions |
| `npm run verify:data` | Dedicated database fixtures and actual Node/Bun/Deno data runs, then real PostgreSQL HTTP/auth backend; fails if a required executor/check is unavailable |

Regression requirements include valid counterexamples, deterministic locations/output, unchanged targets, parser/read errors, absent semantic project context, selected files outside project inclusion, integration failures, unassessed score dimensions and baseline path/scope safety. SARIF must validate against the pinned official 2.1.0 schema. See [scanner](scanner.md), [quality](quality-score.md), [framework/integration limits](framework-signals.md) and [corpus](corpus.md).

The pinned Knip/dependency-cruiser subprocesses receive selected source snapshots, sanitized root dependency metadata and tool-owned config, without target scripts, exports, workspaces, executable configuration or node_modules. Knip plugins are explicitly disabled. Their source export/file/dependency/cycle candidates do not replace full-project dependency review. The explicit type-aware typescript-eslint recipe delegates floating/misused-promise linting to the real linter and has positive/negative executable tests.

## Database and runtime packages

Each example owns its manifest/lock and must be installed separately with `npm ci --ignore-scripts`. Docker fixtures bind dedicated loopback endpoints and use public test credentials. Tests can reset schemas, install rejecting triggers/CHECK constraints or remove Timescale chunks; never substitute a production URL. Run data suites sequentially because they share/reset fixture schemas.

| Package | Required behavioral evidence |
| --- | --- |
| [SQLite](../examples/backend/README.md) | Actual Hono requests and SQLite state, actor/tenant predicates, immutable fields, replay/conflicts and rejecting-outbox-trigger rollback. Injected identity is not a production session adapter. |
| [PostgreSQL backend](../examples/postgres-backend/README.md) | Actual listening HTTP server, Better Auth signup/login/sessions, persisted membership, session expiry/revocation, owner/tenant denial, allowlist/origins, simultaneous clients, uniqueness arbitration, PostgreSQL-induced outbox rollback and pool/listener shutdown. |
| [PostgreSQL/TimescaleDB data](../examples/data/README.md) | Same-client transaction rollback, real constraint errors, distinct concurrent clients, effective-role RLS USING/WITH CHECK and tenant context reuse, migration compatibility, timeouts/recovery, actual extension keys/buckets/aggregates/columnstore/retention. |

The data README records actual Node 24.22.1 + pg/Drizzle, Bun 1.3.10 + postgres.js, and Deno 2.9.8 + npm postgres.js executions against PostgreSQL 17.6 / TimescaleDB 2.22.1. Deno additionally checks denied environment/network permissions. Do not infer every driver/runtime combination, backend authentication on Bun/Deno, scheduler reliability or production ingest performance.

Effective-role relational RLS and the restricted aggregate-view strategy are separate tested fixtures. Continuous aggregates are not assumed to inherit raw-table RLS. Same-key request idempotency and one committed outbox row do not prove distributed exactly-once delivery.

## CI and handoff

Use frozen installs and runtime versions, actual database services where required, narrow Deno permissions, deployment-runtime smoke checks and appropriate migration/recovery gates. Add checks proportionately; do not require every project to adopt the bundled tooling. A configured hosted matrix is pending until executed remotely. Report local OS, server container platform, driver versions and actual runner for each result.

Historical upstream source inspection in [code evidence](code-evidence.md) is not execution of upstream suites. A green compiler or zero auditor leads does not validate authorization, test relevance, security or performance.
