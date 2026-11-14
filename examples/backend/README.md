# Executable Hono + SQLite task feature

An independent package demonstrating a real HTTP application boundary, Zod input
validation, ownership checks, scoped idempotency, and an atomic SQLite outbox write.
The tests invoke Hono's `app.request` with real requests and real in-memory
`node:sqlite` databases. They do not mock transactions or database writes.

## Run

Use Node **24.22.1 or newer in the 24.x line** (tested: 24.22.1) and npm.
From this directory:

```sh
npm ci --ignore-scripts
npm run check
```

`check` runs strict `tsc --noEmit`, then `node --test test/*.test.ts` using native
TypeScript stripping. No transpiler, generated JS, external database, network
listener, or credentials are required. The lockfile pins the resolved dependencies;
the package also pins its direct runtime and development dependencies.

## Feature-local structure

```text
src/app.ts                         composition and sanitized HTTP errors
src/features/tasks/
  constants/task-limits.ts         input bounds used by schemas
  interfaces/authentication.ts    injected identity verification port
  types/task.ts                   identity and schema-derived task types
  schemas/task-schema.ts          strict create/update and stored-value schemas
  task-routes.ts                  HTTP handling and authentication enforcement
  task-store.ts                   scoped SQL and one synchronous transaction
test/tasks.test.ts                executable HTTP/database integration tests
```

Types, interfaces, and constants remain inside their feature. There is no global
type bucket, generic repository, or abstract service hierarchy.

## Contract

| Route | Accepted data | Result |
| --- | --- | --- |
| `POST /tasks` | JSON `{ "title": "Ship report" }`, `Idempotency-Key` header | `201` with task snapshot |
| `GET /tasks/:id` | Verified actor and tenant from the authentication port | `200`, or `404` outside that scope |
| `PATCH /tasks/:id` | Nonempty JSON containing `title` and/or boolean `completed` | `200`, or `404` outside that scope |

All routes require an authenticated actor. Unknown and immutable input fields are
rejected with `400`, including when supplied alongside valid mutable fields.
Titles have 1–200 characters and cannot consist only of whitespace. They are not
trimmed: different title strings are different idempotency payloads. Keys have
1–128 ASCII characters from `A–Z`, `a–z`, `0–9`, `.`, `_`, `:`, and `-`.

The idempotency primary key is `(actor_id, tenant_id, request_key)`. The same key
and same validated payload replay the original `201` response, even if the task
was subsequently updated. A changed payload returns `409`. Another actor or tenant
has a separate key namespace. The semantic payload is explicitly serialized from
the sole validated create field; raw JSON formatting does not affect identity.

`BEGIN IMMEDIATE` covers the lookup, task insert, idempotency response insert, and
outbox insert. No asynchronous or external operation occurs within the transaction.
A real rejecting SQLite trigger in the tests proves all three tables roll back and
the same key can then be retried. The eight overlapping request test covers one
Node process and one synchronous connection; it is not a multi-process load test.

## Authentication boundary

`createApp({ db, authenticate })` requires an `Authentication` implementation.
That implementation must verify credentials/session validity and resolve an
authorized tenant before returning `{ actorId, tenantId }`, or return `null`.
Routes obtain scope only from that result and repeat both predicates in SQL.
Caller-provided identity fields are never accepted as task input.

The hard-coded token map exists **only in the tests**. It is not production
authentication, JWT verification, or a Better Auth integration. To integrate Better
Auth, implement this port against the actual installed version/session API and
tenant membership policy, then add integration tests for expiration, revocation,
membership changes, and any cookie/CSRF/origin requirements of that deployment.
The example ships no permissive default authentication adapter.

## Deliberate limits

- The caller owns the SQLite connection and closes it after requests finish. Give
  this application a dedicated connection; do not wrap calls in an outer transaction.
- Startup creates a fresh example schema; it is not a migration system.
- The outbox stores `task.created` events atomically. No publisher, broker delivery,
  retry worker, exactly-once delivery guarantee, or update event is implemented.
- Idempotency records have no expiry or cleanup policy. Production retention,
  busy handling, connection topology, and crash recovery need their own requirements
  and tests. The suite does not establish distributed/multi-process behavior.
- Synchronous SQLite work blocks the event loop. There is no background fan-out
  here, so no artificial async worker or cancellation abstraction is included.
- Deployment transport, body-size/rate limits, operational logging, and full
  production authentication are outside this focused example. Unexpected failures
  return a sanitized `500`; sensitive database details are not returned to clients.
