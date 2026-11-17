# Deno-native and Oracle integrations: design

Status: proposed, not implemented. Date: 2026-11-17.

## Why

A read-only audit of a real Deno 2 + Hono + Oracle/PostgreSQL backend (private; not shipped here) compared the auditor with the project's own tools:

| Signal | Auditor | Native tool | Result |
| --- | --- | --- | --- |
| `any` | 62 | `deno lint` no-explicit-any: 62 | identical |
| `!` | 116 in `src/` (+16 tests/scripts) | `deno lint` no-non-null-assertion: 116 | identical |
| Vulnerable dependencies | not detected | `deno audit`: 30 advisories (8 high) | **gap** |
| Type errors | not detected (`DENO_SEMANTICS_UNSUPPORTED`) | `deno check`: pass from the entrypoint, 3 errors in `src/`, 4 in tests, 1 in scripts | **gap** |
| Dead files | not detected | none imported two failing files | **gap** |
| Unit tests | not run | 179 pass; 6 fail only through restricted permissions or a missing Oracle client | **gap** |
| SQL built by interpolation | no rule | manual review | **gap** |

The syntax rules are trustworthy; what is missing is the evidence only the project's runtime can give. The design adds it without weakening the read-only contract.

## Goals and non-goals

Goals: surface dependency advisories, type errors, lint, unreachable files and hermeticity of tests for Deno projects; add Oracle-specific leads; keep every result reproducible and clearly labelled by its source.

Non-goals: connecting to any database; running migrations, `task`s, `test:oracle` or `test:secrets`; loading `.env`; installing into the audited project; replacing `deno check` with the TypeScript Program adapter; fixing anything.

## Design

### 1. Deno integrations through the existing `--integration` mechanism

`tool/src/core/external-tools.ts` already runs Knip and dependency-cruiser from a temporary snapshot. Reuse that shape, adding names `deno-audit`, `deno-check`, `deno-lint`, `deno-test` and `deno-graph` to the accepted set in `cli.ts` and `config.ts`.

Execution contract (shared):
- Detect Deno from the root `deno.json`/`deno.jsonc`; absent Deno binary → `INCOMPLETE` with `EXTERNAL_TOOL_ERROR`, never a silent skip.
- Snapshot into `os.tmpdir()`: inspected sources, `deno.json(c)` and `deno.lock` as **data only**, no `.env`, `node_modules`, certificates, `.git` or scripts. The audited tree is never written.
- `spawnSync` with `shell: false`, bounded timeout and output (the current `runBounded`), `NO_COLOR=1`, `DENO_NO_UPDATE_CHECK=1`, no inherited project environment beyond `PATH`/`HOME`.
- Record the Deno version and the exact argument list in the report's `integrations` entry.
- Lifecycle scripts stay blocked (Deno default); the snapshot never runs `deno approve-scripts`.

| Integration | Command in the snapshot | Permissions | Finding codes |
| --- | --- | --- | --- |
| `deno-audit` | `deno audit` (text parsed; `--json` does not exist in 2.9.8, so the parser is version-pinned and fails closed on an unknown shape) | network to the Deno advisory service only | `DENO_AUDIT_ADVISORY` (package, range, severity, GHSA link) |
| `deno-check` | `deno check` on explicit globs: entrypoints, then all `src/`, `scripts/`, `test/` separately | none (no `--allow-*` at check time) | `DENO_TYPE_ERROR` (TS code, file, line); groups reported by reachability |
| `deno-lint` | `deno lint --json` plus `--rules-include=no-non-null-assertion,no-unused-vars` | none | `DENO_LINT` (rule code kept); duplicates of auditor rules marked `corroborates: EXPLICIT_ANY` rather than double counted |
| `deno-graph` | `deno info --json <entrypoints>` | none | `DENO_UNREACHABLE_FILE` (source not in the graph of any entrypoint or test) |
| `deno-test` (opt-in) | `deno test --no-check --deny-net` with read/env/sys only | `--allow-run`/`--allow-write`/`--allow-ffi` never added automatically | `DENO_TEST_FAILURE`, each tagged `permission`, `environment` or `assertion` |

Reporting rules:
- Advisories get a reachability tag from `deno-graph`: `imported-by-reachable-source`, `only-by-unreachable-file` or `not-imported` (transitive dependencies are reported as `transitive`). Without it, an advisory on a dead dependency reads as urgent.
- Severity mapping stays within P2/P3: high → P2, others → P3. Confidence is a new value `EXTERNAL_TOOL` rather than `HEURISTIC`, so a report distinguishes "a pattern worth reading" from "the project's own tool failed". This adds a value to the schema; see the decision list.
- A test failure caused by a denied permission or a missing native client is classified, never reported as a project defect.
- Scores are untouched: external findings do not feed `--score` unless a later change defines their weight.

### 2. Oracle leads

Static, in the existing rule engine (no connection, no driver):
- `SQL_STRING_INTERPOLATION`: a `${}` inside a template literal passed to `execute`/`query`/`queryStream` or assigned to a SQL-looking constant. A substitution is cleared when it resolves, within the file, to a string literal/constant, a placeholder pattern (`:${n}` / `$${n}`) or a member of an exported frozen map. Everything else stays a lead. Corpus label: parameterized-constant fragments must not fire (the fixture project's `${query}` and `ORDER BY ${order}` cases are the negative and the "verify the whitelist" positive).
- `ORACLE_TEST_NOT_HERMETIC`: a test file whose import graph reaches `oracledb` without a stub, so it needs the native client. Lead only; names suggest, the graph proves.
- Dynamic `ORDER BY`/identifier interpolation flagged separately, because binds cannot protect identifiers.

Environment preflight (new `doctor` subcommand, separate from the audit): reports Instant Client version found in `ORACLE_CLIENT_LIB_DIR`/`PATH` against the version `oracledb` requires (e.g. DPI-1050 at 12.2 vs 19.1+), thick/thin mode setting read from configuration, and platform mismatch of bundled client libraries. It reads file metadata only. It does not open a connection, so it cannot confirm credentials, network reachability or privileges, and says so.

### 3. Documentation and reference changes

- `references/runtime-deno.md`: replace the current prose command list by the table above and the preflight order (`audit` → `check` → `lint` → `graph` → `test`).
- New `references/oracle.md`: thick/thin, bind variables, cursor lifecycle, transactions with locking, error-number mapping, pool warm-up; loaded only when `oracledb` is a dependency, same pattern as `postgresql.md`.
- `references/scanner.md` and `SKILL.md`: list the new integrations and the `DENO_SEMANTICS_UNSUPPORTED` workaround ("use `deno-check`").
- `SKILL.md` rail R4: supply-chain advisories require reachability and fix-version evidence before any upgrade (R0a still governs the upgrade itself).

## Verification plan

No private source is shipped. Build a synthetic Deno fixture that reproduces each observed behaviour:
1. a dependency pinned to a version with a known advisory, one imported and one not;
2. an entrypoint that type-checks plus an unreferenced file with a type error;
3. a test that needs `--allow-run` and one that needs the native client (stubbed `oracledb` package);
4. SQL templates: a constant fragment, a `:${n}` placeholder, and a dynamic identifier.

Acceptance: counts equal the native tool on the fixture; the tool reports `INCOMPLETE` (not clean) when Deno, network or a parser shape is unavailable; the audited tree hash is unchanged after a run; no `.env` content or path appears in any report. Network-dependent `deno-audit` tests are skipped, not failed, when offline. Record Deno and package versions in `docs/verification/`.

## Delivery order

1. `deno-check` + `deno-lint` + `deno-graph` (offline, deterministic).
2. `deno-audit` with reachability.
3. Oracle static rules and corpus labels.
4. `doctor` preflight and `references/oracle.md`.
5. Opt-in `deno-test`.

## Decisions for the owner

1. New confidence value `EXTERNAL_TOOL`, or reuse `HEURISTIC`? (Schema version bump either way is avoided only if reused.)
2. `deno-audit` sends package names and versions to the advisory service. Acceptable by default, or only with an explicit flag?
3. Should `deno-test` exist at all, given suites can build native artifacts or need disposable databases? Default proposal: opt-in only.
4. Oracle `doctor` as part of this skill, or documented guidance only?
