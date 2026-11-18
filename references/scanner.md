# Auditor: setup, contracts and limits

The maintained auditor and tests are strict TypeScript. The legacy CommonJS executable is generated. Use findings to choose review locations; they do not establish vulnerabilities, runtime validation, authorization or production readiness.

## Prepare

Inside the skill directory, intentionally run:

```sh
npm ci --ignore-scripts
npm run build
npm run check
npm test
```

The complete pinned tool dependency set requires Node >=22.13.0; full recorded execution uses24.22.1. Compilation is explicit; audited projects need no dependency installation or compiler replacement. Instructions alone need no Node installation. Do not copy stale build outputs between revisions: build the installed sources.

TypeScript6.0.3 is loaded from this skill's absolute node_modules path. `TS_RAILS_TYPESCRIPT_PATH` deliberately overrides it with an absolute trusted API module. That executes the selected module; never choose target-controlled code. Invalid overrides fail. No ancestor/target package lookup selects the compiler implicitly.

## Modes and selected scope

```sh
node scripts/ts-rails-audit.cjs --root TARGET --format json
node scripts/ts-rails-audit.cjs --root TARGET --path src --exclude-tests
node scripts/ts-rails-audit.cjs --root TARGET --mode typed --project tsconfig.json --score
```

`syntax` is the default, with parser-only analysis and the original eight rules. Import-aware framework leads also run when recognized imports are present; see [framework signals](framework-signals.md). `.ts`, `.tsx`, `.mts`, `.cts` are inspected; declarations are context only. Repeat --path with files/directories within the root, not globs. Missing/outside paths fail. Root deno.json/deno.jsonc are inspected even with --path. Nested Deno workspace configs require explicit runs. Root realpath is canonical; discovered symlinks are skipped and listed; selected ancestors that resolve outside the root fail.

Excluded traversal directories: node_modules, .git, dist, build, coverage, .next, vendor, .turbo, .output, .nuxt, .svelte-kit. Other generated code needs explicit scope. Tests/fixtures and .test/.spec files retain `scope:test` unless excluded. This is naming classification, not reachability proof. A deliberate security toggle in a test is not a deployed vulnerability.

`typed` requires the explicit --project config or root tsconfig.json. It reads JSON configs/references, creates real Programs and obtains TypeCheckers. It never builds referenced projects or executes compiler plugins. Missing declarations/references/dependencies and all compiler diagnostics are visible and make analysis INCOMPLETE. No silent fallback to syntax. Selected files absent from resolved Programs are OUTSIDE_PROJECT, not silently clean. Resolve dependencies in the target only as a separately authorized project task.

Colocated Deno `_test.ts`/`_test.tsx`/`_test.mts`/`_test.cts` and basename `test.ts` variants are classified as tests alongside `.test`/`.spec`; similarly named source such as `test_driver.ts` or `latest_test_helper.ts` remains source. Classification remains a convention. `--exclude-tests` records the excluded paths. With excluded tests or an explicitly narrowed path, the tests score is unevaluated and carries no missing-test evidence.

The Program adapter does **not** resolve Deno import maps/JSR/runtime libraries. If no tsconfig exists but a Deno config does, or --project selects deno.json/deno.jsonc, it emits `DENO_SEMANTICS_UNSUPPORTED` and inspects zero source files semantically. When no Program can be created, the root diagnostic is retained without repeating OUTSIDE_PROJECT for every selected file. This is a tool capability limitation, not proof of a project defect. See [Deno verification](runtime-deno.md) for native checks that preserve the audited target.

Programs may read supporting source/declarations outside --path but within the audited root, plus the explicitly trusted compiler's library directory. Out-of-root symlink reads are rejected; workspace packages outside root require choosing an appropriate common root. `semantic.projects`, contextFiles and externalReads report context. Limits: source2MiB by default, declarations16MiB, total semantic128MiB and20000 reads. Library declarations such as lib.dom exceed the source-file budget. These are resource guards, not an OS sandbox or a general termination guarantee for every input.

Typed JSON detection uses actual default-library JSON.parse/Body.json signatures and the verified Node/Undici BodyMixin.json declaration, including callable aliases; serializers and shadowed globals are excluded. It does not prove custom validation or follow arbitrary data flow. Typed Promise.all detects builtin signatures and selected constant bind aliases; small finite tuples (default limit16) can discharge a map lead. Arrays, large/rest tuples and other unproved bounds retain leads. Custom concurrency helpers and arbitrary aliases are not solved.

Typed mode emits a resolved import/reexport graph; --score or configured boundaries also enable it. Type-only edges are distinguished, and runtime cycle leads contain an actual closed cycle. See [quality dimensions](quality-score.md) for normalization, complexity, delegation and test-evidence limits. File length and folder names alone establish no defect.

## Configuration

Explicit `--config FILE` reads a version1 JSON object (max1MiB); no automatic JS configuration loading. Unknown options/rules, invalid booleans, nonpositive thresholds and invalid integrations fail. CLI options override config; omitted values use defaults. API options use the same validation.

```json
{
  "version": 1,
  "mode": "typed",
  "project": "tsconfig.json",
  "paths": ["src"],
  "excludeTests": true,
  "score": true,
  "concurrencyLimit": 16,
  "complexityLimit": 15,
  "cloneMinTokens": 60,
  "rules": { "NON_NULL_ASSERTION": false },
  "boundaries": [{ "from": "src/domain", "disallow": ["hono", "src/http"] }]
}
```

Rules are review policies, not security exceptions. Disabled rules do not convert an incomplete scan into a complete one. Do not require comments or suppressions per valid occurrence.

## Rules

All results are P2/P3 HEURISTIC, never automatic P0/P1.

| Original rule | Recognizes and limits |
| --- | --- |
| EXPLICIT_ANY | Explicit any AST keyword; interop/generics may be valid; implicit any belongs to compiler diagnostics |
| NON_NULL_ASSERTION | Postfix assertion; review the established invariant |
| RETURN_IN_FINALLY | A return exits cleanup in the current function and can replace an earlier return or thrown value. Nested functions have their own return target. |
| AWAIT_ASYNC_FOREACH | Typed mode resolves an awaited array or readonly-array `forEach` and a promise-returning callback. The array method discards those promises. |
| EMPTY_CATCH | No statements, including comment-only catches; deliberate probes/fallbacks can be valid |
| UNVALIDATED_JSON_CAST | Direct raw JSON assertions including await/conditional/logical forms; syntax cannot distinguish every serializer, typed refines builtin signatures |
| AUTH_SECURITY_DISABLED | Literal true at two option names; syntax name alone proves no auth reachability |
| POTENTIALLY_UNBOUNDED_CONCURRENCY | Promise.all map; typed discharges only statically small finite tuples, not arbitrary bounds |
| TS_SUPPRESSION | Directive-shaped @ts-ignore/@ts-nocheck at parser comment boundaries; not a full simulation of compiler directive placement |
| BROAD_DENO_PERMISSIONS | Direct Deno task run/test/serve/bench -A/--allow-all before script/--; root configs only, no shell expansion |

Deno supports separate --config/-c/--import-map values. Wrappers, compound flags, task indirection, variables and unrecognized options may be missed. Inspect the actual deployment permissions.

Additional rules and counterexamples are documented in [framework signals](framework-signals.md), [quality](quality-score.md) and [external integration](#external-tools). PostgreSQL and TimescaleDB have independent [PostgreSQL](postgresql.md)/[TimescaleDB](timescaledb.md) guides and real executable tests. The auditor does not infer transactions, RLS, schema invariants, indexes, retention or aggregate safety from arbitrary dynamic SQL. It never connects to a database or executes migrations/EXPLAIN.

## Baselines and SARIF

```sh
node scripts/ts-rails-audit.cjs --root TARGET --write-baseline /reports/rails-baseline.json
node scripts/ts-rails-audit.cjs --root TARGET --baseline /reports/rails-baseline.json --fail-on-new
node scripts/ts-rails-audit.cjs --root TARGET --format sarif
```

Baselines are versioned, validated JSON (max8MiB), matched to normalized selected paths, mode/project, rules and analysis options. Fingerprints use rule, relative file, normalized AST context and occurrence; unrelated line insertion remains known. Identical occurrences can become ambiguous when inserted/reordered. Context changes can intentionally make a lead new. No global security identity is claimed.

Baseline comparison reports added/known/absent and comparable. Incomplete scans never label absent findings fixed; mismatched policy/scope fails. Known leads remain visible. --fail-on-new requires --baseline and returns2 only for new leads after valid comparison. Errors/incomplete always return1.

--write-baseline is explicit report output. It requires a complete scan and dedicated .json destination, rejects source/reserved configuration paths and symlinks, creates exclusively by default, and requires --replace-baseline to replace a valid existing baseline. Parent directories must already exist. Comparison and overwrite of the same baseline in one invocation are rejected. A baseline write is a modification: for read-only audits place it outside the target in an authorized report directory.

SARIF2.1.0 includes relative encoded locations, heuristic rule metadata, fingerprints and execution diagnostics. Structural validation against the official schema is exercised by tests; URI encoding has explicit regressions. INCOMPLETE yields executionSuccessful:false and nonzero exit, not a clean upload. CI Code Scanning upload is not performed automatically.

## External tools

`--integration knip` and `--integration dependency-cruiser` explicitly launch skill-pinned executables in separate processes with controlled temporary snapshots, 30-second timeout and8MiB output limit. NODE_OPTIONS/NODE_PATH are removed in the child. This is process separation, not an OS security sandbox.

Only successfully inspected selected TypeScript source text, sanitized root dependency inventories and tool-owned JSON configs are copied. No project scripts, executable configuration, node_modules, exports/workspaces or custom compiler plugins are copied. All installed Knip plugins are disabled. Temporary files are outside the target and removed afterward. A root package manifest contributes to configsInspected only when this integration reads it. Symlinked/oversized manifest input fails visibly.

Knip6.45.1 contributes possible unused files/exports/dependencies; dependency-cruiser18.7.2 contributes cycle leads. Fixed snapshot entry preference is src/index.ts, index.ts, src/main.ts, main.ts, then first selected path. Missing assets, non-TS entrypoints, config-only dependencies and workspace roots can make legitimate code appear unused. This is deliberately bounded source-snapshot triage, not the tools' full native project analysis; inspect context before removal. Module aliases/assets/custom resolvers are not reproduced. A requested tool that is missing, fails, times out or returns invalid output makes the scan INCOMPLETE. No automatic installs, fixes or target configuration execution occur.

For promise linting use the opt-in [typed ESLint recipe](../tool/src/recipes/typed-eslint.ts) in a trusted project. Its pinned typescript-eslint8.73.0 / ESLint10.15.0 rules are tested on real positive/negative typed code. The auditor does not invoke a target linter, test or build automatically.

## API and exits

`getTS(root?)`, `files(root, options?)`, `audit(root, ts, options?)` and `scan(root, ts, options?)` remain exported by scripts/ts-rails-audit.cjs after build. audit returns a report; scan retains Finding[] and throws on INCOMPLETE. Original options paths/excludeTests/maxFileBytes remain supported. JSON schemaVersion1 and original fields are retained; typed/graph/score/baseline/integration sections are additive and graph/score versioned independently. Default syntax output omits optional sections unless requested.

| Result | Exit | Meaning |
| --- | --- | --- |
| COMPLETE | 0 | Selected checks completed; leads may exist |
| INCOMPLETE or usage/config/compiler error | 1 | Inspect diagnostics; no clean-audit inference |
| COMPLETE + --fail-on-signals and leads | 2 | Explicit signal policy, not confirmed insecurity |
| COMPLETE + --fail-on-new and new leads | 2 | Explicit regression policy |

Ordering is deterministic and locations are one-based/root-relative. Original parser checks preserve successful-file findings when others fail. No-source scope is INCOMPLETE. Existing declaration/build/test exclusions remain visible. Use [corpus](corpus.md), [measurement artifact](../docs/verification/benchmark-v2.json) and [verification record](../docs/verification/2026-11-16-v2.md) for actual evidence, not generalized accuracy/performance claims.

## Deno integrations

For a Deno project the syntax rules cannot resolve import maps or JSR, and `typed` reports `DENO_SEMANTICS_UNSUPPORTED`. The Deno integrations run the project's own tools instead:

```sh
node scripts/ts-rails-audit.cjs --root TARGET --integration deno-check --integration deno-lint --integration deno-graph --integration deno-audit
```

Each runs in a temporary snapshot made of the inspected sources plus `deno.json(c)`, its `importMap` file and `deno.lock` as **data**. `.env`, certificates, `node_modules`, scripts and other configuration are never copied and the audited tree is never written. Deno's own cache is written outside the target. A missing `deno` executable, missing configuration, an unexpected output shape or a timeout makes the report `INCOMPLETE`; none of them is reported as clean. Parsers are pinned to Deno 2.9.8 output.

| Integration | Runs | Finding | Notes |
| --- | --- | --- | --- |
| `deno-check` | `deno check` over every snapshot file | `DENO_TYPE_ERROR` (P2) | Finds errors in files no entrypoint reaches, which `deno check src/main.ts` misses |
| `deno-lint` | `deno lint --json` with the project's lint config | `DENO_LINT` (P3) | `no-explicit-any` and `no-non-null-assertion` are not repeated; `EXPLICIT_ANY` and `NON_NULL_ASSERTION` own them |
| `deno-graph` | `deno info --json` per entrypoint | `DENO_UNREACHABLE_FILE` (P3) | Entrypoints: conventional `main/mod/index/server/app` (root or `src/`), files named in `deno.json` tasks/exports, all test files. No entrypoint found → `INCOMPLETE`. Dynamic imports with computed specifiers, scripts and Lambda handlers can be false positives |
| `deno-audit` | `deno audit` | `DENO_AUDIT_ADVISORY` (P2 for high/critical, otherwise P3) on `deno.lock` | Requires `deno.lock` (without it Deno reports no vulnerabilities, a false clean result). Sends package names and versions to the Deno advisory service. Each advisory is tagged `reachable from entrypoints` or `not in the entrypoint graph`; an advisory is a lead for `R0a`-compliant upgrade work, not a reason to upgrade blindly |

These findings come from the project's tools, so they are evidence of what Deno reports, not a security grade. They do not feed `--score`.

## SQL interpolation rules

`SQL_STRING_INTERPOLATION` and `SQL_DYNAMIC_IDENTIFIER` (P2, heuristic) inspect `execute`, `executeMany`, `query` and `queryStream` calls, whatever the receiver, whose static text looks like a SQL statement and which interpolate or concatenate something that is not a constant of the same file. Numbered placeholders (`` :${n} ``, `` $${n} ``), string/number literals and same-file `const` fragments are cleared; parameters, imports, calls and shadowed names are leads. They do not follow imports, wrappers or call sites and do not prove injection. A request-controlled value in a clause position is the case to review first. See [Oracle](oracle.md) for the Oracle context and the `doctor oracle` environment preflight (`node scripts/ts-rails-audit.cjs doctor oracle --root TARGET`).
