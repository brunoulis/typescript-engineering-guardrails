# Real PostgreSQL session backend

Independent strict TypeScript example: Hono → Better Auth's real Drizzle adapter → PostgreSQL through postgres.js. The SQLite example in `../backend` remains independent. This package runs on **Node 24.22.1** and owns its manifest, lock, migrations and tests. It never accepts a production database URL.

## Run

Use the disposable PostgreSQL fixture described in [the data example](../data/README.md). First run `npm ci --ignore-scripts` and `npm run db:up` from `../data`; then run `npm run db:prepare` here. The backend bootstrap checks the fixed container's ownership label and exact image digest before creating its dedicated database and restricted app login. It cannot accept a production URL or arbitrary container override. The data package owns container startup/teardown.

This provisions database `guardrails_backend` with migration login `guardrails` and restricted application login `guardrails_backend_app`. The latter receives `CONNECT` on that database and `USAGE` on `public`; the checked-in migration grants its table permissions. It must not own the database/schema/tables or have superuser/BYPASSRLS privileges. The suite tests those effective privileges.

From this package directory in PowerShell:

```powershell
npm ci --ignore-scripts
npm run db:prepare
$env:BACKEND_MIGRATION_DATABASE_URL='postgres://guardrails:local_guardrails_only@127.0.0.1:55432/guardrails_backend'
$env:BACKEND_TEST_DATABASE_URL='postgres://guardrails_backend_app:local_backend_app_only@127.0.0.1:55432/guardrails_backend'
npm run check
```

These credentials and the sample secret in `.env.example` are public fixture values. Environment files are examples; the package does not load them automatically. URLs must explicitly name a loopback host, port, credentials and dedicated database (`guardrails_backend` or `rails_backend_test`), with no URL query or fragment. There is no implicit `DATABASE_URL` fallback. Environment variables are required: missing database access fails the test command, never skips it.

The migration runs transactionally with an advisory lock and stored SHA-256 checksum. Repeated application verifies the existing checksum. It cannot overwrite a changed applied migration. Tests create random users/tenants, clean only their rows in `finally`, and temporarily install a trigger and CHECK constraint in this **dedicated database**. Run only one copy of this suite against a given backend database at a time. Never point another application at it.

To run the local HTTP server:

```powershell
npm run migrate
$env:BETTER_AUTH_SECRET='local-development-only-replace-this-32-character-secret'
npm start
```

This listens on `127.0.0.1:8787` (`PORT` can override it). SIGINT/SIGTERM drain the listener, then close the pool. The drain is bounded to five seconds before active connections are closed; postgres.js ends with its own five-second bound. Tests also exercise an actual client disconnect during an unfinished HTTP request, subsequent server health, repeated shutdown, listener refusal and an ended pool.

## Request and persistence contracts

- `/api/auth/sign-up/email`, `/sign-in/email` and `/get-session` use Better Auth's HTTP handler, actual password hashing, signed session cookies and persisted sessions. Authentication never consumes identity headers. Database session lookup runs without cookie caching, so expired/revoked sessions stop working.
- Tenant IDs select a requested tenant; every request checks persisted membership for the authenticated user. Users cannot grant themselves membership. Administrative provisioning in tests uses the separate migration connection.
- `POST /tenants/:tenantId/tasks` accepts only `{ "title": "..." }` and a 1–80 character alphanumeric/underscore/hyphen `Idempotency-Key`. Unknown fields are rejected. The title is trimmed, nonempty and at most 120 characters; request bodies are limited to 16 KiB.
- The key namespace is `(tenant, owner, key)`. A unique constraint arbitrates simultaneous requests. The winner returns 201; equivalent retries return 200 and the existing task; a changed canonical title returns 409. The saved creation hash remains stable after a title update. A replay returns the current task representation. Tasks cannot currently be deleted, so idempotency entries do not expire.
- The task and its outbox event use the same Drizzle transaction object. `ON CONFLICT DO NOTHING` waits for a concurrent unique-key winner; the subsequent READ COMMITTED statement reads that committed row. No external operation occurs while this transaction is open.
- `GET /tenants/:tenantId/tasks` returns owned tasks with deterministic ascending UUID keyset pagination (`limit` 1–50, default 20; optional UUID `cursor`). Single-task GET and PATCH include both owner and tenant predicates. PATCH accepts only `title`. Each business query also requires membership in its SQL predicate, beyond the HTTP gate.
- Missing sessions return 401; missing membership returns 403; an inaccessible owned object returns 404; invalid input returns 400; disallowed write origins return 403; oversized bodies return 413. Unexpected database errors return only `{ "error": "internal_error" }` with 500.

The schema includes PK/UNIQUE/FK/CHECK invariants: task owners must have a membership row, and outbox task/tenant pairs must match. A membership row referenced by existing tasks cannot be deleted: an administrative revocation model that retains ownership history needs a separate active/suspended state or archival workflow before extending this fixture. The membership revocation test removes an unreferenced grant. This example demonstrates explicit query authorization; it does **not** claim RLS isolation. The independent data package owns the RLS contracts.

Both Better Auth and business writes enforce the configured origin. Business cookie-authenticated writes require an exact `Origin`, including rejecting absent origins. Local HTTP cookies use HttpOnly and SameSite=Lax; Secure follows HTTPS configuration. No CSRF/origin checks are disabled. The supplied server is intentionally a local fixture; production TLS, reverse proxy trust, distributed rate limits, administrative membership changes, outbox delivery and telemetry require deployment-specific work.

The app pool has four connections, a three-second connect/lock budget, five-second statement/idle-in-transaction limits, and a ten-second idle connection lifetime. Budget it per process; the pool is not an HTTP admission-control queue. Fixtures use separate owner connections to inject failures. No performance improvement is claimed.

## Verified versions and API evidence

Installed package metadata, `npm ls --depth=0` and the lock agree:

| Component | Version |
| --- | --- |
| Node | 24.22.1 |
| TypeScript / Node types | 6.0.3 / 24.19.2 |
| Hono / Node adapter | 4.13.19 / 2.1.8 |
| Better Auth / Drizzle adapter | 1.7.25 / 1.7.25 |
| Drizzle ORM | 0.45.4 |
| postgres.js | 4.1.1 |
| Zod | 4.6.7 |
| PostgreSQL tested | 17.6 |

Official documentation was compared with the matching released source/declarations before implementation:

- [Better Auth installation and HTTP handler](https://better-auth.com/docs/installation), [Drizzle adapter documentation](https://better-auth.com/docs/adapters/drizzle), [v1.7.25 adapter source](https://github.com/better-auth/better-auth/blob/v1.7.25/packages/drizzle-adapter/src/drizzle-adapter.ts): explicit `provider`, schema and transactional adapter option.
- [v1.7.25 core auth schemas](https://github.com/better-auth/better-auth/tree/v1.7.25/packages/core/src/db/schema), [session implementation](https://github.com/better-auth/better-auth/blob/v1.7.25/packages/better-auth/src/api/routes/session.ts), and installed `@better-auth/core/dist/types/init-options.d.mts`: schema fields, database session lookup, trusted origins and cookie attributes.
- [Drizzle PostgreSQL documentation](https://orm.drizzle.team/docs/get-started-postgresql), [0.45.4 postgres.js transaction implementation](https://github.com/drizzle-team/drizzle-orm/blob/0.45.4/drizzle-orm/src/postgres-js/session.ts): the callback uses the transaction's reserved client.
- [postgres.js v4.1.1 README](https://github.com/porsager/postgres/blob/v4.1.1/README.md): parameterization, pool/timeouts and `end({ timeout })`.
- [Hono Node guide](https://hono.dev/docs/getting-started/nodejs), [Node adapter v2.1.8 server source](https://github.com/honojs/node-server/blob/v2.1.8/src/server.ts), and installed declarations: local listener creation, fetch handler and shutdown ownership.

## Verification recorded 2026-11-16

`npm run check` ran the strict compiler and **17 passing tests, zero skips**, against actual PostgreSQL 17.6 and the restricted application login. The HTTP suite uses real listening sockets, not injected session/auth mocks. Expected Better Auth warnings for an invalid password and rejected origin appear during negative tests.

The concurrency fixture holds at least two distinct PostgreSQL backends at an advisory-lock INSERT barrier before releasing eight HTTP requests. It proves one committed task and one outbox event, retries, a changed-body conflict and a distinct owner's key namespace. The rollback fixture adds a real PostgreSQL outbox CHECK failure, observes HTTP 500 and no task/idempotency claim, removes the constraint, then retries successfully. The migration and pool-close paths were also exercised. These results cover this Node/PostgreSQL combination; no Bun/Deno backend claim is inferred.

Observed red/green cycles included a missing URL-guard rejection, missing-session route (404→401), absent migration tables, absent business routes, and a listener-only shutdown that left the pool queryable. No handwritten JavaScript is maintained; `dist/` is disposable compiler output.
