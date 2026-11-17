<p align="center">
  <img src="assets/logo.gif" alt="TypeScript Engineering Guardrails logo" width="480">
</p>

# TypeScript Engineering Guardrails — Node, Bun, Deno

A portable skill for backend implementation, audit, review and refactoring, with a read-only TypeScript auditor and executable HTTP/database evidence. Preserve feature-local `types/`, `interfaces/` and `constants/`, runtime validators in `schemas/`, and existing project conventions without empty scaffolding.

**2.0.0** adds strict TypeScript tool sources, optional semantic context and dependency analysis, separate quality dimensions, JSON configuration, baselines/SARIF, controlled external integrations and real PostgreSQL/TimescaleDB examples. Findings remain P2/P3 **HEURISTIC** review leads. No scan certifies security, authorization, test quality or production readiness.

## Prepare and run

See [installation](INSTALL.md) for portable folder and host discovery instructions. Instructions can be used without installing the optional tool dependencies. For the auditor, run inside this skill folder, never inside the audited application:

```sh
npm ci --ignore-scripts
npm run build
node scripts/ts-rails-audit.cjs --root /path/to/backend --format text
```

The complete tool dependency set requires **Node >=22.13.0**; local full verification uses **24.22.1**. The lock pins TypeScript **6.0.3**. Build produces the compatible legacy `.cjs` entry from TypeScript; generated JavaScript is not maintained source. The default compiler comes from this skill, not the target's node_modules. An absolute `TS_RAILS_TYPESCRIPT_PATH` deliberately selects a trusted executable compiler module; an invalid override fails.

Example request:

> Use typescript-engineering-guardrails in audit mode with api, auth and database profiles. Verify deployed versions, validation, tenant permissions, transactions, asynchronous limits and unnecessary abstractions. Keep the audit read-only and report evidence, confidence and unresolved checks.

## Select the evidence

```sh
# Default syntax triage, selected source scope
node scripts/ts-rails-audit.cjs --root /path/to/backend --path src --exclude-tests --format json
# Explicit semantic project context, graph and quality dimensions
node scripts/ts-rails-audit.cjs --root /path/to/backend --mode typed --project tsconfig.json --score --format json
# Opt-in, pinned external tools on a controlled source snapshot
node scripts/ts-rails-audit.cjs --root /path/to/backend --integration knip --integration dependency-cruiser
```

Typed mode reads admitted tsconfig/project context without executing project configuration or emitting application files. Missing dependencies/configuration, selected files outside the program and unsupported reads remain diagnostics and make analysis incomplete. It does not install missing target dependencies. Quality dimensions remain separate 0–3 values or `null`; there is no total. Test import reachability is not behavioral coverage. See [scanner contract](references/scanner.md), [quality dimensions](references/quality-score.md) and [framework/integration limits](references/framework-signals.md).

Explicit `--config /trusted/path/rails.json` loads validated JSON (`version: 1`), not executable JS configuration. CLI options override corresponding configured options. For example:

```json
{
  "version": 1,
  "mode": "typed",
  "project": "tsconfig.json",
  "score": true,
  "boundaries": [{ "from": "src/domain", "disallow": ["hono", "src/http"] }]
}
```

External integrations use Knip **6.45.1** and dependency-cruiser **18.7.2** with tool-owned temporary configuration, selected source copies and sanitized root dependency/dev/optional names and versions. All installed runtime Knip plugins are explicitly disabled; target scripts, exports, workspaces, executable configuration and node_modules are omitted. The results identify possible unused exports/files/dependencies and cycles in that snapshot. Dependency candidates may be used through omitted assets, framework configuration or workspace entry points; the integration cannot establish full-project unused dependencies. Timeout/failure is incomplete analysis. The explicit [typescript-eslint recipe](tool/src/recipes/typed-eslint.ts) uses typescript-eslint **8.73.0** / ESLint **10.15.0** for promise rules in a trusted project; it is not an automatic target hook.

## Baselines, reports and policy

```sh
# Choose an authorized, dedicated report destination; its parent must exist
node scripts/ts-rails-audit.cjs --root /path/to/backend --write-baseline /reports/backend-baseline.json
node scripts/ts-rails-audit.cjs --root /path/to/backend --baseline /reports/backend-baseline.json --fail-on-new --format sarif
```

JSON reports retain `schemaVersion: 1`; SARIF is 2.1.0. Baselines bind mode, enabled rules and normalized scope. Unrelated line insertion keeps finding identity stable; identical repeated contexts can remain ambiguous. Incomplete or incompatible scans cannot establish that absent findings were fixed. Baseline creation rejects incomplete reports and unsafe destinations; existing files require explicit `--replace-baseline`, and replacement is limited to a recognized baseline.

Exit **0** means complete selected analysis; **1** means execution/configuration/incomplete-analysis failure; **2** means the explicit `--fail-on-signals` or valid `--fail-on-new` policy found triggering leads. Signals never become confirmed vulnerabilities merely because a policy failed. JSON/SARIF go to stdout; shell redirection is an additional write to the destination you choose.

## Executable examples

| Independent package | Evidence |
| --- | --- |
| [Hono/SQLite](examples/backend/README.md) | Fast HTTP regression, injected verified identity, actor/tenant authorization, allowlisted input, idempotency and actual SQLite rollback |
| [Hono/Better Auth/Drizzle/PostgreSQL](examples/postgres-backend/README.md) | Real signup/login/session cookies, persisted membership, restricted app login, concurrent idempotency and task/outbox rollback under actual PostgreSQL failure |
| [PostgreSQL/TimescaleDB data](examples/data/README.md) | Constraints, same-client transactions, distinct concurrent clients, effective-role RLS and pool reuse, migrations, partition-aware keys, buckets, aggregates, columnstore and retention counterexamples |

Each package owns its lockfile and documented setup. The data fixtures bind only dedicated loopback ports, verify pinned Docker ownership/artifacts and contain destructive tests. Never use production databases. PostgreSQL and TimescaleDB are activated by the actual stack, independently of an ORM: see [PostgreSQL](references/postgresql.md), [TimescaleDB](references/timescaledb.md) and [Drizzle](references/drizzle.md).

## Verification and limits

```sh
npm ci --ignore-scripts
npm --prefix examples/backend ci --ignore-scripts
npm --prefix examples/data ci --ignore-scripts
npm --prefix examples/postgres-backend ci --ignore-scripts
npm run verify
npm run verify:data
```

`verify` builds/tests the auditor and checks SQLite. `verify:data` starts the pinned local fixtures, runs actual Node/Bun/Deno data contracts and checks the PostgreSQL backend sequentially; Docker, Bun and Deno must be available. It fails when required executors/checks are unavailable. Fixtures remain running for investigation; coordinate all users before `npm --prefix examples/data run db:down`.

Recorded local example execution on 2026-11-16 used Node **24.22.1**, Bun **1.3.10**, Deno **2.9.8**, PostgreSQL **17.6** and TimescaleDB **2.22.1**, with Linux database containers on Windows Docker Desktop. The PostgreSQL backend recorded **17 passing tests, zero skips**. See package READMEs for the exact driver/runtime rows, versioned APIs, commands and limitations. No full driver/runtime cross-product is claimed. [Configured CI](.github/workflows/skill-ci.yml) is separate from remotely executed success; cross-OS hosted results are not asserted here. Release acceptance remains pending final aggregate checks and independent review.

The original **57-test v1.2 validation and pinned upstream source scans on 2026-11-14 are historical evidence**, not the current v2 test count. Their limits and counterexamples remain in [code evidence](references/code-evidence.md). Labeled corpus/measurement results belong in [corpus evidence](references/corpus.md); they do not establish production precision, runtime speedups or agent productivity.

See [contributing](CONTRIBUTING.md) for meaningful negative tests and evidence requirements. For each investigated lead, record fixed/verified, legitimate/retained, or deferred with an unresolved question. Keep sound code without blanket suppressions or invented abstractions.

MIT; see [LICENSE](LICENSE). Third-party dependencies and server artifacts retain their own license terms.
