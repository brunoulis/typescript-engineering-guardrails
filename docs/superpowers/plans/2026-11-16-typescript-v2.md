# TypeScript v2 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for the core and superpowers:dispatching-parallel-agents for independent data examples. Steps use checkbox syntax for tracking.

**Goal:** Deliver the approved v2 auditor and reproducible PostgreSQL/TimescaleDB examples.
**Architecture:** One strict TypeScript tool package with generated CommonJS compatibility entry. Independent example packages own their locks and databases; no target-controlled executable configuration.
**Tech Stack:** TypeScript 6.0.3, Node 22+ tool/24.22.1 full checks, Compiler API, node:test, PostgreSQL, TimescaleDB, Hono/Better Auth/Drizzle, postgres.js.
**Spec:** ../specs/2026-11-16-typescript-v2-design.md (approved 2026-11-16, including PostgreSQL/TimescaleDB).

## Global constraints

- Keep getTS/audit/scan/files, schemaVersion 1 syntax behavior and exit 0/1/2; generated JavaScript only.
- Preserve strict/noUncheckedIndexedAccess/exactOptionalPropertyTypes and meaningful negative tests.
- No target mutation, implicit compiler loading, automatic JS config execution or production database use.
- No commits/push/releases; work on main in the existing checkout as explicitly requested by the user.
- Record missing executions honestly; do not label v2 validated with pending required checks.

## Review focus

- Selected files outside tsconfig: INCOMPLETE, never clean omission (task 2).
- Baseline path overwrite/symlink and changed scope: reject without touching files (task 3).
- Config/plugin subprocess errors: bounded execution and INCOMPLETE (task 4).
- RLS pool tenant context reuse: no leakage across transactions (task 5).
- Deleted raw buckets refreshed: negative example demonstrates aggregate loss (task 6).

## Task 1: Typed source and compatibility

Files: tool/src/{cli,core/audit,core/project-discovery,core/compiler,rules/syntax,types/report,constants/defaults}.ts; tool/test/*.test.ts; tool/build.ts; tsconfig.json; package.json; scripts/ts-rails-audit.cjs (generated).
Interfaces: audit(root:string,ts:Compiler,options:AuditOptions={}):AuditReport; scan returns Finding[]; getTS(root?:string):Compiler; files returns string[].
- [x] Add CLI/API characterization tests and run current 57 tests before migration.
- [x] Move implementation/tests to strict TS; compile CommonJS with tsc, generate legacy entry from TS.
- [x] Check type errors, then run compiled tests and original compatibility expectations.

## Task 2: Typed analysis and graph

Files: tool/src/core/{typed-project,dependency-graph}.ts; tool/src/rules/typed.ts; tool/test/typed.test.ts.
Interfaces: typedProject(root,files,ts,options,diagnose):TypedContext; inspectSource accepts optional checker; graph reports resolved edges.
- [x] RED: alias JSON.parse, shadowed JSON/Promise, bounded tuples, missing dependency/tsconfig, tsconfig path/reexport cycles, selected file outside project.
- [x] Implement safe config/program/reference reads, diagnostics, symbols, tuple bounds, imports and configured boundaries.
- [x] GREEN: typed tests and full core suite.

## Task 3: Configuration, quality, baseline and SARIF

Files: tool/src/core/{config,quality,baseline}.ts; tool/src/reporters/{text,json,sarif}.ts; tool/test/reporting.test.ts.
Interfaces: validated AuditOptions from config; score dimensions with null or 0..3; baseline versioned identity/scope; sarif(report) object.
- [x] RED: invalid config, evidence-based clones/complexity/wrappers, stable baseline on line insertion, scope mismatch, incomplete baseline, overwrite/symlink, SARIF locations/diagnostics.
- [x] Implement JSON config validation, graph/quality metrics, fingerprints and safe exclusive baseline write; integrate CLI flags.
- [x] GREEN: full suite; validate SARIF against official schema using pinned validator.

## Task 4: External integrations and framework signals

Files: tool/src/core/external-tools.ts; tool/src/rules/{frameworks,postgresql,timescaledb}.ts; tool/test/integrations.test.ts; templates/eslint.config.mjs (generated or TS source recipe).
- [x] RED: real pinned Knip/dependency-cruiser fixtures, timeouts/error reporting, trusted config only, framework import aliases and valid counterexamples.
- [x] Add explicit opt-in adapters with controlled config/timeout; provide type-aware typescript-eslint recipe, not duplicated lint rules.
- [x] Add limited import-aware PostgreSQL/framework leads; Timescale dynamic policies remain not evaluated; document exact detection limits.
- [x] GREEN: integrations actually execute; full suite.

## Task 5: Hono/Better Auth/Drizzle/PostgreSQL backend (independent)

Files: examples/postgres-backend/** with independent package/lock/tests/migrations.
- [x] RED: actual HTTP sign-up/login/session, tenant/actor denial, immutable fields, idempotent concurrency, DB-induced rollback.
- [x] Implement verified versions, session-backed membership, constraints and transaction/outbox; local dedicated database guard and clean shutdown.
- [x] GREEN: strict typecheck and real PostgreSQL tests; record commands/versions.

## Task 6: PostgreSQL/TimescaleDB data package (independent)

Files: examples/data/** with independent package/lock, SQL, tests, Node/Bun/Deno runners; references/{postgresql,timescaledb}.md; templates/data-audit.md.
- [x] RED: same-client rollback, constraint failures, concurrent writes/RLS context reuse, hypertable keys, buckets/DST, recent+late aggregates, columnstore roundtrip and retention/refreshed-loss counterexample.
- [x] Implement bounded parameterized operations and dedicated ephemeral fixtures, exact server/extension/version inventory; Drizzle smoke; postgres.js runtime runners.
- [x] GREEN: Node pg/Drizzle, Bun postgres.js, Deno postgres.js against real database/extension; record missing prerequisites accurately.

## Task 7: Runtime/CI, corpus and benchmark

Files: tool/bench/*.ts; tool/test/corpus.test.ts; .github/workflows/skill-ci.yml; runtime fixtures in examples/data.
- [x] Add labelled positive/negative corpus and deterministic comparison; benchmark syntax/typed with medians/spread/RSS and fixed input.
- [x] Pin runtime/database setup, execute Node/Bun/Deno and denied-permission cases; CI runs core on Windows/macOS/Linux and data on Linux.
- [x] Verify clean installation/build and target immutability.

## Task 8: Documentation and final verification/review

Files: SKILL.md, README.md, INSTALL.md, CONTRIBUTING.md, references/{scanner,drizzle,runtime-*,testing-and-ci,code-evidence}.md; docs/verification/2026-11-16-v2.md.
- [x] Update commands/capabilities/limitations together; preserve old API contracts.
- [x] Run all relevant checks, actual data/runtime suites and benchmark; record output and failures.
- [x] Fresh independent whole-change review; fix important findings RED→GREEN and rerun affected/full checks.
- [x] Set 2.0.0 only when acceptance is met; otherwise retain prerelease and explicit remaining validation. Deliver local diff without commit/push.
