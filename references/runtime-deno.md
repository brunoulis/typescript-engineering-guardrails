# Deno profile

Inspect `deno.json`, package/import maps, lock strategy, permissions, deployment target and npm/native-addon requirements. Deno 2 interoperability does not prove every Node API, driver or package behaves identically. Use the existing `deno check`, lint/fmt/test/task commands as appropriate; do not force an unrelated tsconfig or runtime migration.

Grant the narrowest practical network, environment, filesystem, subprocess and FFI permissions. A trusted build tool using broad permissions is a contextual review lead; a production service needs its own permission justification. Track pools, startup and termination, including serverless lifecycle.

## Audit a Deno application

Use `deno.json`/`deno.jsonc`, import maps, the resolved Deno lock and installed package metadata to identify the real dependency graph and commands. A package.json test script can be a scaffold placeholder while Deno tasks provide the actual suite. Follow the current governing project instructions when older README commands disagree; inspect the task and its prerequisites before running it. Colocated `*_test.ts`, `*.test.ts` and `test.ts` files have test scope in the auditor. Test helper directories need their own reachability review; names do not prove deployment.

The bundled TypeScript Program adapter does not implement Deno import maps, JSR or Deno runtime-library resolution. A Deno project without tsconfig, or an explicit Deno config selected as --project, receives one `DENO_SEMANTICS_UNSUPPORTED` diagnostic and an incomplete typed report. Use syntax triage plus actual Deno verification; creating a tsconfig for the scanner does not establish Deno compatibility.

For a read-only typecheck with Deno2.9.8 and an existing prepared dependency tree, select the project's entrypoints/source globs with `deno check --frozen-lockfile --cached-only --node-modules-dir=manual`. Verify those flags against the installed CLI. Manual mode prevents changes to node_modules; the frozen lock rejects dependency drift; cached-only blocks implicit downloads. A cache miss is a blocked check, never a reason to install into the audited target automatically. Compiler cache writes outside the target may still occur.

A canonical test task can build native/FFI artifacts, create disposable databases or require Redis even when named unit. Read its runner and guards before execution. For strict read-only inspection, use source/check evidence and mark those test suites unexecuted; a passing compiler is not a passing suite. Never load the project's .env or run its migration, backfill or policy-install commands merely to inspect versions or validate this skill. Put project-specific reports outside the distributable skill and derive minimal synthetic regressions without shipping private source, credentials or environment values.

## Native checks through the auditor

`--integration deno-check|deno-lint|deno-graph|deno-audit` automates the read-only native checks described above against a data-only snapshot (see [scanner](scanner.md#deno-integrations)). Prefer them to hand-run commands for a first pass; they report `INCOMPLETE` rather than clean when Deno, the lockfile, the network or an entrypoint is missing. `deno test` is intentionally not wrapped: a suite can build native artifacts, need disposable databases or a native client (for example an Oracle client of a minimum version); run it only after reading its runner, with the narrowest permissions.

## Executed data contracts

[The data package](../examples/data/README.md) records **Deno 2.9.8** with npm **postgres.js 3.4.7**, PostgreSQL **17.6** and TimescaleDB **2.22.1**. After its separate `npm ci --ignore-scripts` and `npm run db:up`, run from that package:

```sh
deno task check
deno task test
node src/verify-deno-permissions.ts
```

The Node command launches Deno subprocesses and verifies actual missing-environment and missing-network rejections; it is not a substitute for Deno execution. The real Deno suite executes the shared bounded batch/rollback/constraint/timeout and Timescale contracts, closing its clients. It also runs Hono4.13.19 through native Deno.serve on an ephemeral loopback port and checks validation, malformed input, sanitized errors, propagated cancellation, shutdown and fresh TCP refusal. Run sequentially with the other runtimes because fixture schemas are shared/reset.

`deno.json` pins the `npm:postgres@3.4.7` mapping, uses `nodeModulesDir: manual`, and relies on the installed package-lock graph instead of claiming a separate Deno lock. The test grants network only to the loopback host `127.0.0.1` (the HTTP port is ephemeral; database ports remain fixed55432/55433), read access only to `sql`, and environment reads only for `PGAPPNAME,PGMAX_PIPELINE`. These defaults are read by this installed driver; verify them again on a version change. No arbitrary network, subprocess, filesystem write or blanket environment permission is granted to the runtime suite.

The Node-based negative-test harness separately owns process creation. This targeted evidence does not establish the Node HTTP/auth backend on Deno or every npm/native dependency. Missing Deno or an unexecuted permission check remains pending; do not call Node and label it Deno coverage.

Sources: [Deno configuration](https://docs.deno.com/runtime/fundamentals/configuration/), [Node/npm interoperability](https://docs.deno.com/runtime/fundamentals/node/) and [security permissions](https://docs.deno.com/runtime/fundamentals/security/). Match official guidance to the installed version before API or permission changes.

## Native integration decisions

Load [native interoperability](native-interoperability.md) only for measured CPU work, an existing native capability or requested interoperability. Keep Hono/auth/Drizzle and a working backend communicator in place. `deno_core` ops belong to embedding/building a custom runtime; they are not an integration layer for a conventional Hono service.

Review IPC executable allowlists with `--allow-run`, environment/cwd inheritance and actual deployment process support. FFI and Node-API require `--allow-ffi`; addons also need compatible local `node_modules` and prepared platform binaries. Review exact package scripts and artifact source/hash before authorized preparation, and verify these requirements against the selected Deno release and addon. Neither permission sandboxes native code; a child has its own OS access. Build-tool privileges and runtime permissions are different evidence.

The [isolated stdio worker example](../examples/deno-native-worker/README.md) exposes one batched domain operation and documents its own runtime, release artifact, limits and checks. It is not a replacement for an existing communicator or proof of a performance gain. This profile does not infer that its execution covers FFI, Node-API, Wasm or other platforms. Follow its recorded commands/results and keep missing performance/distribution evidence explicit.
