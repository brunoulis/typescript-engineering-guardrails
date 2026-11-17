# Executable PostgreSQL and TimescaleDB evidence

Independent strict TypeScript package. Fixtures use real PostgreSQL, never an in-memory substitute or a mocked transaction. They reset their own schemas and exercise destructive retention counterexamples. No production connection string is accepted: URLs are fixed to dedicated loopback ports/database names and the database must carry the provisioner's fixture marker. Provisioning verifies container ownership labels and pinned image digests before reusing or removing a container. Database ports bind only to 127.0.0.1; data lives in tmpfs. Starting Docker Desktop is a prerequisite on Windows.

Run sequentially from this directory; Node and runtime suites reset the same Timescale schema and must not overlap:

```sh
npm ci --ignore-scripts
npm run db:up
npm run typecheck
npm test
bun src/run-runtime.ts
deno task check
deno task test
node src/verify-deno-permissions.ts
npm audit
# After all database/backend work finishes:
npm run db:down
```

`db:down` removes only the two labeled fixtures. The PostgreSQL container may also hold the independent backend example's database; coordinate its shutdown. tmpfs contents disappear on container stop. `db:up` creates `guardrails_data` and `guardrails_timescale`; it does not create the backend database. All passwords here are public local fixture credentials, not deployment defaults.

Versions executed on Windows x64, 2026-11-16: Node 24.22.1, Bun 1.3.10 (task-local npm artifact `@oven/bun-windows-x64@1.3.10`), Deno 2.9.8; TypeScript 6.0.3, pg 8.16.3, postgres.js 3.4.7, Drizzle 0.45.4, Hono 4.13.19 and Bun type declarations 1.3.10. package-lock pins installed modules for all three runtimes; Deno uses this manual npm installation, with explicit `npm:postgres@3.4.7` and `npm:hono@4.13.19` import maps and no separate Deno lock graph. Drizzle 0.44.7 was rejected during setup because of [GHSA-gpj5-g38j-94v9](https://github.com/advisories/GHSA-gpj5-g38j-94v9); final `npm audit` reports zero vulnerabilities. Installed declarations and tagged upstream sources were checked before API use.

| Actual execution | Evidence |
| --- | --- |
| Node + pg + PostgreSQL 17.6 | PK/FK/UNIQUE/CHECK/NOT NULL negative cases, real outbox failure rollback on one backend PID, two distinct simultaneous transaction clients, atomic increments, real timeout cancellation and connection recovery, restricted LOGIN role RLS USING/WITH CHECK, pool reuse after rollback and commit, expand migration compatibility, actual EXPLAIN ANALYZE BUFFERS |
| Node + pg + TimescaleDB 2.22.1 / PG 17.6 | Complete shared timescale contracts below |
| Node + Drizzle 0.45.4 + TimescaleDB | Scoped transaction insert, bounded parameterized hypertable read, explicit aggregate refresh and parameterized read; restricted tenant aggregate view tested through pg |
| Bun 1.3.10 + postgres.js 3.4.7 | Actual Bun TS execution; parameterized/bounded atomic batch, quoted malicious-looking value roundtrip, real CHECK and uniqueness errors/rollback, timeout recovery, complete shared Timescale contracts; client ends in finally |
| Deno 2.9.8 + npm postgres.js 3.4.7 | `deno check` and `deno test` execute the same reference contracts; separate subprocess tests prove failure with missing environment or network permissions |
| Bun 1.3.10 + Hono 4.13.19 + native `Bun.serve` | Actual ephemeral loopback HTTP listener; validated success, invalid values/malformed JSON, redacted 500 error, client abort observed by pending handler, awaited server stop, fresh TCP connection refused afterward |
| Deno 2.9.8 + Hono 4.13.19 + native `Deno.serve` | Same HTTP contracts and actual native shutdown; Deno test resource/op sanitizers pass; missing network permission also rejects the native listener |

Node + Drizzle + PostgreSQL HTTP/authentication evidence is owned by `../postgres-backend`, not this package. No every-driver/every-runtime support claim is made.

The native HTTP fixture is a focused Hono/Web API runtime contract, not a cross-runtime Better Auth claim. `bun src/run-runtime.ts` runs both data and HTTP; `deno task test` runs two tests (data and native HTTP). The Node suite also tests the unknown-JSON boundary through Hono's request API. TDD first observed the unvalidated endpoint accepting invalid input (`201 !== 400`), then passed after adding runtime shape/range checks. Cancellation uses a handler-entry barrier before aborting the client; no sleep determines whether the server received the request. Shutdown requires a fresh TCP `ECONNREFUSED`, not a timeout or simply calling close. Windows Deno's closed-port refusal took about two seconds, so the bounded probe allows five seconds and still fails on timeout. Deno 2.9.8 emits its documented notice that successful responses also abort request.signal under legacy semantics; the assertion concerns a still-pending request and does not claim signals abort only on disconnect. No unstable flag is needed.

Regression check executed: temporarily routing the transaction callback through the pool instead of its acquired client made the real PostgreSQL rollback assertion fail (`1 !== 0`: a partial reading survived). Restoring same-client operations returned the suite to green. The mutation was restored in finally and is not part of the delivered source.

Shared Timescale contracts exercise rejected keys missing the temporal **or additional hash partition** column; valid partition-inclusive PK and duplicate rejection; bounded [start,end) queries; absent buckets distinguished from zero; Madrid 23-hour and 25-hour days; explicit materialized-only/realtime tail; late historical arrival remains stale until refresh; actual chunks converted using `CALL convert_to_columnstore`, full query equality plus supported insert/update afterward; fixed-date raw chunk deletion with historical summaries preserved by a nonoverlapping refresh, then demonstrably lost when a forced refresh refetches the deleted window. Separate policy creation/catalog assertions verify 30-day raw retention, 7-day refresh start and 1-hour end; jobs are immediately disabled. No sleeps across calendar days or dependence on scheduler timing.

The shared policy lifecycle regression then requests 45-day retention with `if_not_exists` and verifies the installed duration remains 30 days. Explicit removal/recreation installs 45 days; a disabled desired setting/log alone still leaves that catalog policy, and explicit removal makes it absent. Existing jobs stay paused; replacement creation uses the fixed future start before immediately pausing it. TDD with `npm run test:timescale` first failed the desired-duration assertion (`30 days` versus `45 days`), then passed after reconciliation; the disabled-state assertion separately failed (`1 !== 0`), then passed after explicit removal. This is fixture-only catalog evidence, not scheduler execution or permission to reconcile a deployed database. Configuration changes and swallowed SQL errors must not be logged as verified success. Integer settings also need validation after normalization: `0.5` truncated to zero must not create zero-day retention; this fixture uses fixed SQL rather than an environment parser.

The aggregation fixture intentionally does not combine continuous aggregates with raw-table RLS. Its application role `guardrails_metrics_a` can read only a security-barrier view with a fixed tenant literal; tests use this effective login to prove tenant isolation and deny direct aggregate/raw reads. The independent relational fixture proves RLS with `guardrails_data_app` (not owner/superuser/BYPASSRLS), `FORCE ROW LEVEL SECURITY`, transaction-local verified-identity context and max-one pool reuse. These are separate strategies, not evidence that continuous aggregates inherit RLS.

`deno task test` grants network only to host `127.0.0.1` (the databases plus ephemeral native HTTP port), read access to `sql`, and environment reads for `PGAPPNAME,PGMAX_PIPELINE`. The host grant needs all local ports because the OS chooses the HTTP port at runtime; external hosts remain unavailable. postgres.js 3.4.7 reads these defaults during initialization; supported public options are explicit for the others. `PGMAX_PIPELINE` has no public Options declaration in this version, so it is allowed as a driver environment read rather than bypassing TypeScript. No subprocess, filesystem write, external network or blanket environment permission is granted. Run from this directory after `npm ci`; dependencies are npm packages via Deno's package.json/nodeModulesDir support.

Pinned server artifacts (source tag labels are descriptive; digest is authoritative):

- `postgres:17.6-alpine` → `postgres@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94`.
- `timescale/timescaledb:2.22.1-pg17` → `timescale/timescaledb@sha256:fba60021a224479e174ae1ec577c1a0576d5185b09fe9e622f1d19e4bf5bab0d`.

The executed platform is linux/amd64 inside Docker Desktop. Tests assert `server_version` 17.6 and extension 2.22.1, and print inventory. Other platforms or versions require new execution evidence. This self-hosted image needs no cloud account; Timescale features have upstream license terms, and no unrestricted-license claim is made.

EXPLAIN is measured over 2,002 fixture rows; its plan is printed, never asserted as an exact index-node contract or presented as a production benchmark. Pool limits and timeouts are fixture budgets, not production sizing guidance. The expand SQL deliberately operates on a tiny dedicated fixture; real backfills need bounded batches and operational lock evidence. No production rollback/recovery performance, real-time scheduler reliability or ingest throughput has been measured.

Sources consulted: [pg transaction contract](https://node-postgres.com/features/transactions), [postgres.js v3.4.7 README](https://github.com/porsager/postgres/blob/v3.4.7/README.md), [Drizzle 0.45.4 driver source](https://github.com/drizzle-team/drizzle-orm/blob/0.45.4/drizzle-orm/src/node-postgres/driver.ts), [PG17 RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), [Timescale 2.22.1 DDL](https://github.com/timescale/timescaledb/blob/2.22.1/sql/ddl_api.sql), [versioned policies](https://github.com/timescale/timescaledb/blob/2.22.1/sql/policy_api.sql), [columnstore procedure](https://www.tigerdata.com/docs/reference/timescaledb/hypercore/convert_to_columnstore), [retention/aggregate deletion contract](https://www.tigerdata.com/docs/learn/data-lifecycle/data-retention/data-retention-with-continuous-aggregates). Current prose documentation is cross-checked with installed/versioned APIs and real execution, not treated as proof by itself.

Native HTTP APIs were checked against [Hono 4.13.19 source](https://github.com/honojs/hono/blob/v4.13.19/src/hono-base.ts), [Bun 1.3.10 declarations](https://github.com/oven-sh/bun/blob/bun-v1.3.10/packages/bun-types/serve.d.ts) and [Deno 2.9.8 declarations](https://github.com/denoland/deno/blob/v2.9.8/cli/tsc/dts/lib.deno.ns.d.ts), then executed on those actual runtimes.
