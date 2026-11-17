# Contributing — evidence before claims

Preserve feature-local `types/`, `interfaces/` and `constants/`, runtime schemas in `schemas/`, and existing conventions without artificial wrappers. The auditor, tests, build scripts and examples are maintained in strict **TypeScript**. `scripts/ts-rails-audit.cjs` is a generated compatibility entry, not the implementation to edit. No additional maintained language/toolchain is needed.

## Establish the actual versions

Read [SKILL.md](SKILL.md), the relevant reference, affected manifests and lockfiles. Verify installed/resolved metadata before using or changing library APIs. Consult matching official release/tag documentation, declarations and tests; explain version gaps or unverified behavior. Dependency cleanup is not authorization for upgrades.

The complete tool dependency set declares Node **>=22.13.0**; local full verification uses **24.22.1**, TypeScript **6.0.3**, and each package's independent lock. Examples require their documented Node range. Bun **1.3.10** and Deno **2.9.8** execution evidence is limited to the rows recorded in [the data package](examples/data/README.md).

## Change the smallest proven boundary

1. Reproduce the concrete defect or review risk. Observe a meaningful failing test before changing behavior; preserve the original syntax/API/CLI regressions.
2. Modify `tool/src/**/*.ts` and corresponding `tool/test/*.test.ts`, then regenerate through `npm run build`. Keep `getTS`, `audit`, `scan`, `files`, JSON `schemaVersion: 1`, default syntax behavior and exits 0/1/2 compatible unless an approved change states otherwise.
3. Include legitimate counterexamples: shadowed symbols, import aliases, bounded tuples, runtime validation, adapters with real work and deliberate auth fixtures. Typed evidence and resolved imports improve context; they do not prove arbitrary interprocedural behavior.
4. Test failed/incomplete analysis as well as leads: missing dependencies/tsconfig, selected source outside the program, read/parse/budget failures, external tool timeout/errors and disabled or unassessed score dimensions.
5. Preserve target immutability. Never import target-controlled compiler packages or executable configuration by default; do not execute project scripts, plugins or automatic package-manager installs. Explicit trusted compiler loading executes code and must remain deliberate.
6. Test baseline scope mismatch, incomplete comparisons, stable identities, unsafe destinations/symlinks and replacement protections; validate SARIF against the pinned official schema fixture. Reports cannot hide diagnostics or label missing findings fixed after incomplete analysis.
7. Validate authentication and database claims through real HTTP and the relevant server/driver, including actor/tenant denial, mass assignment, concurrent idempotency, actual rollback failures, lifecycle and effective restricted roles. Mocks cannot establish these contracts.
8. Obtain independent skeptical review for substantive changes, documenting remaining inference limits and exceptions.

For guidance updates, apply the revised instructions to a realistic retrieval/task scenario. Focused command/link review is appropriate for narrow prose corrections; tests that only assert wording do not establish usability.

## Reproduce local verification

From the repository root containing SKILL.md:

```sh
npm ci --ignore-scripts
npm run build
npm --prefix examples/backend ci --ignore-scripts
npm --prefix examples/data ci --ignore-scripts
npm --prefix examples/postgres-backend ci --ignore-scripts
npm run verify
npm run verify:data
```

`verify` runs strict root checking, regenerates/builds the auditor, executes its tests, then checks the actual Hono/SQLite example. `verify:data` runs the independent data and PostgreSQL HTTP/auth backend sequentially, including actual Bun/Deno executors and missing-permission negatives. Docker must be running, and the documented executors must be available; required checks are never silently replaced with Node or marked passing when unavailable. See [data setup](examples/data/README.md) and [backend setup](examples/postgres-backend/README.md). These disposable databases contain destructive fixtures and must not be shared with production or overlapping test runs. Coordinate cleanup after all users finish.

Useful focused commands:

| Command | Scope |
| --- | --- |
| `npm run check` | Root strict typecheck without emit |
| `npm test` | Root build and compiled TypeScript tests, including preserved compatibility tests and real pinned external integrations |
| `npm run test:corpus` | Labeled corpus evidence; see its limitations |
| `npm run benchmark` | Repeatable auditor workload measurement, not an application performance benchmark |
| `npm --prefix examples/backend run check` | Hono/SQLite typecheck and integration tests |
| `npm --prefix examples/postgres-backend run check` | Explicitly configured real PostgreSQL backend typecheck and tests |

Independent examples have their own installations and locks. Do not modify an audited project's dependency graph to run the skill. Intentional dependency changes require reviewed lock diffs and a clean frozen install.

## Review the limits with the result

The Knip/dependency-cruiser integrations inspect selected source plus sanitized root dependency metadata with tool-owned configuration and disabled Knip plugins. Export/file/dependency/cycle candidates cannot establish real application entry points, asset reachability, framework configuration or full-project unused dependencies. Retain these limits in reports. The explicit typescript-eslint promise recipe is separate trusted project tooling, not an executable configuration hook for read-only auditing.

`COMPLETE` describes the selected analysis. All auditor leads remain P2/P3 HEURISTIC. Classify each investigated lead as fixed/verified, legitimate/retained, or deferred with a concrete open question. Quality grades are separate evidence dimensions; no combined repository ranking or behavioral test coverage is inferred.

Record commands, exits, actual runtime/server/driver versions, skips/failures, security and compatibility implications, rollback/recovery constraints and reviewer outcome. Never suppress a failing check, weaken strict settings, or change assertions merely to make a suite green. No production safety, performance improvement or general precision/recall claim follows from synthetic tests or a small pinned corpus.

[CI](.github/workflows/skill-ci.yml) describes intended hosted checks; writing or locally inspecting it does not establish remote Linux/macOS/Windows success. Distinguish executed local evidence, configured CI and pending acceptance. Keep public fixture credentials clearly identified; exclude real secrets, node_modules, private reports, downloaded corpora and build caches from contributions.
