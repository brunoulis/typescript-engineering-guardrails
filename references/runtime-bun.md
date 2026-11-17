# Bun profile

Bun has substantial Node compatibility but its runtime, APIs and test runner are not identical. Verify native addons, Node API gaps, async context, TLS, workers, instrumentation and build assumptions against the installed version. Preserve the project's lock and frozen installation strategy; a refactor does not authorize migration to Bun.

Measure the actual application workload before claiming throughput, RSS or latency improvements. Test external services, authentication adapters, drivers and telemetry on Bun itself when that runtime is deployed. `bun test`, Node test compatibility, mocks, coverage and process isolation require their own evidence.

## Executed data contracts

[The data package](../examples/data/README.md) records **Bun 1.3.10** running TypeScript directly with **postgres.js 3.4.7** against PostgreSQL **17.6** and TimescaleDB **2.22.1**. From that package after `npm ci --ignore-scripts` and `npm run db:up`, run:

```sh
bun src/run-runtime.ts
```

The runner performs parameterized bounded batches, actual rollback/uniqueness/CHECK errors, malicious-looking value roundtrip, timeout recovery and the shared Timescale key/bucket/refresh/columnstore/retention contracts. It also starts a native Bun.serve listener with Hono4.13.19 on an ephemeral loopback port: success and invalid/malformed inputs, sanitized errors, deterministic request cancellation, awaited shutdown and subsequent fresh TCP refusal are verified. It closes its own clients. Run sequentially with the other data runtimes because fixtures reset the same schema. This recorded Windows execution used a task-local pinned Bun artifact, not an assumption from Node compatibility.

This is a targeted driver/runtime combination. The Hono/Better Auth/Drizzle PostgreSQL backend has Node evidence; these data tests do not establish that authentication stack on Bun, every Node API or production telemetry compatibility. Running Node underneath a command is not Bun execution evidence. Missing Bun must be reported as an unexecuted required check, not silently skipped or substituted.

Source: [Bun Node.js compatibility](https://bun.sh/docs/runtime/nodejs-compat). Match the deployed release, installed declarations and actual execution before prescribing APIs or migration.
