# Verification strategy and quality gates

## Progressive verification
- Before editing: capture git status, relevant tests, API/DB invariants and known failures. Commands must match project scripts and runtime.
- Quick: check/tsc, formatter in check mode, existing ESLint/biome/deno lint, focused tests, static AST review (heuristic).
- Full on critical changes: integration tests against actual DB driver, HTTP request tests, authz matrix, migration up/down policy, property/fuzz for parsers when justified, external dependency mocks only as supplement to contract tests.
- CI: frozen dependency resolution, lockfile, lint/typecheck/test, migration check, dependency/license/secrets scanning as allowed, deploy target smoke tests. No mandatory tool replacement.
- Security tests should cover 401/403/404 semantics chosen by project, tenant/resource mismatch, missing session, wrong role, duplicate webhook, invalid JSON, huge request and transaction rollback.
- `strict` and other compiler checks should be introduced without silently breaking the established build; consider new-code baseline for legacy migration.

## Reports
Include precise commands/exit codes, runtime and dependency versions, test failures, environment constraints and untested areas. No fabricated numbers or assertions that the pipeline is green without executing it.

## Executable reference checks

From the skill directory, after intentionally preparing its own pinned dependencies:

| Command | What it verifies |
|---|---|
| `npm ci --ignore-scripts` | Reproducible local scanner dependency installation; writes the skill's dependency directory |
| `npm test` | Positive/negative syntax cases, CLI exits, incomplete scopes, parser diagnostics and read-only behavior |
| `npm run check` | Scanner JavaScript syntax |
| `npm --prefix examples/backend ci --ignore-scripts` | Separate example dependency setup |
| `npm --prefix examples/backend run check` | Strict type checking and Hono/SQLite HTTP/database integration tests |

The example uses actual SQLite transactions: a rejecting outbox trigger must leave no task, idempotency record or event. Removing the actor/tenant predicates or transaction makes its tests fail. Its overlapping-request test establishes behavior on one synchronous connection in one Node process, not distributed exactly-once processing.

See `code-evidence.md` for pinned source scans and counterexamples. Upstream source inspection is not execution of upstream suites, production security testing or a Bun/Deno compatibility result. The scanner does not invoke a target project's build, compiler, lint or tests: run those separately according to risk.
