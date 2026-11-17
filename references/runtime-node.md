# Node.js profile

Inspect the actual Node version, module mode, tsconfig resolution, TS stripping/build pipeline, deployed target and lock. Node's ability to strip some TypeScript syntax does not replace typechecking or imply support for all syntax/path aliases.

Guard event-loop work, streams/backpressure, AbortSignal, HTTP timeouts, pools, listeners/timers, unhandled rejections and graceful shutdown. Introduce workers only for measured CPU-bound work and include transfer/startup costs. Review proxy trust, headers, CORS separately from authentication, secrets, privileges and supply-chain policy.

Use the project's existing compiler/linter/test runner and deployment smoke checks. Do not migrate its runtime to run this skill. The auditor's whole dependency set requires Node >=22.13.0 and pins TypeScript 6.0.3; full local checks use **24.22.1**. Prepare with `npm ci --ignore-scripts` and `npm run build`; `npm run check` is strict checking, and `npm test` builds and executes compiled tests. Generated legacy CommonJS is not maintained source.

## Actual local evidence

- [SQLite backend](../examples/backend/README.md): Hono/SQLite HTTP contracts, injected identity, actual rollback and strict checking under the documented Node 24 range.
- [PostgreSQL backend](../examples/postgres-backend/README.md): actual Better Auth/Drizzle HTTP sessions, persisted membership, simultaneous idempotency, outbox rollback, restricted app role and listener/pool lifecycle. It uses postgres.js 4.1.1.
- [Data package](../examples/data/README.md): Node + pg 8.16.3 against PostgreSQL 17.6 and TimescaleDB 2.22.1, plus Drizzle 0.45.4 Timescale operations; effective-role RLS, connection reuse, constraints, same-client transactions, concurrent clients and extension contracts.

Driver versions and module modes are package-specific. Consult installed declarations/tagged sources before modifying transaction, timeout, cancellation or adapter APIs. Node database results do not establish identical Bun/Deno behavior. Database execution and configured cross-OS CI also remain separate evidence; local container tests used Linux/amd64 on Windows Docker Desktop.

Sources: [Node TypeScript support](https://nodejs.org/api/typescript.html), [Node test runner](https://nodejs.org/api/test.html), [Node HTTP](https://nodejs.org/api/http.html). These current reference pages must be matched to the deployed Node version before API changes.
