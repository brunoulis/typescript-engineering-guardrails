# Syntax triage: setup, contract and limits

Use the scanner to find review locations. It does not resolve symbols, follow data flow, certify authorization/SQL safety, apply fixes or enforce folder conventions. Existing compiler/linter/security tooling remains authoritative within its own scope.

## Prepare and run

The tool runs on Node 22+; recorded validation used Node 24.22.1. In the **skill directory**, intentionally run `npm ci --ignore-scripts`. Its lockfile pins the JavaScript compiler API at TypeScript 6.0.3. A package named TypeScript is not sufficient if it does not expose that API.

The default compiler is resolved from the installed skill, not from the audited root. To deliberately use a different trusted compiler, set `TS_RAILS_TYPESCRIPT_PATH` to its absolute module path. An invalid explicit override fails. Loading a package executes its code: only choose a trusted compiler. Setup never requires installing dependencies in the audited project.

Run with an absolute path to the script when outside the skill directory:

    node scripts/ts-rails-audit.cjs --root TARGET --format json
    node scripts/ts-rails-audit.cjs --root TARGET --path src --path workers --exclude-tests

Paths are repeatable files or directories within the root, not glob expressions. Missing/outside paths fail. Root `deno.json` and `deno.jsonc` are inspected even with `--path`; nested workspace configs require a separate run with that workspace as root. Root is resolved to a real directory; discovered symlinks are skipped and recorded. Source extensions: `.ts`, `.tsx`, `.mts`, `.cts`; declaration files are excluded.

Dependency/build directories (`node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `vendor`, `.turbo`, `.output`, `.nuxt`, `.svelte-kit`) are excluded during traversal. Other generated code is not automatically recognized: select actual source paths. Without `--exclude-tests`, test signals remain visible with `scope: test`. Test classification uses `test/`, `tests/`, `__tests__/`, fixture directories and `.test.*`/`.spec.*` names; it is a convention, not proof of reachability.

## Reports and exit codes

JSON `schemaVersion: 1` retains `root`, `filesInspected`, `disclaimer`, `results`; it adds `compilerVersion`, `status`, `filesDiscovered`, `configsInspected`, `testsExcluded`, `skipped`, `diagnostics`. Locations are one-based and paths are root-relative. Results are sorted deterministically. There are no timestamp or performance claims in the report.

| Result | Exit | Meaning |
|---|---|---|
| `COMPLETE` | 0 | Selected source syntax was inspected; findings may exist |
| `INCOMPLETE` | 1 | Invalid syntax/config, failed file inspection, file over 2 MiB, or zero selected source files |
| Usage/root/compiler/discovery error | 1 | Diagnostic on stderr; no successful report |
| `COMPLETE` with signals and `--fail-on-signals` | 2 | Explicit signal gate triggered, not a confirmed security failure |

Incomplete reports retain diagnostics and findings from successfully inspected files. Incomplete takes precedence over the signal gate. Files with parse errors are not treated as analyzed. `COMPLETE` is relative to the selected scope and listed exclusions, never equivalent to passing `tsc`, complete repository coverage, runtime validation or security certification.

For programmatic callers, `audit(root, ts, options)` returns the report; `scan(root, ts, options)` retains the original findings-array shape but throws when analysis is incomplete. Options: `paths`, `excludeTests`, `maxFileBytes` (positive integer, default 2 MiB). `files(root, options)` returns selected source paths.

## Rules and counterexamples

All results are `HEURISTIC`. These are priorities for investigation; none automatically becomes P0/P1.

| Rule | Priority | Recognizes | Review before changing |
|---|---|---|---|
| `EXPLICIT_ANY` | P2 | Explicit AST `any` keyword | Framework generics and interop may justify it; implicit `any` is the compiler's job |
| `NON_NULL_ASSERTION` | P3 | Postfix non-null assertion | A previously established invariant may justify it |
| `EMPTY_CATCH` | P2 | Catch block with no statements | A fallback or deliberate probe may be correct; comment-only blocks still need inspection |
| `UNVALIDATED_JSON_CAST` | P2 | Assertions on raw `JSON.parse`/`.json()` calls, awaited/parenthesized forms, conditional and logical branches | No API/type resolution; a method named `json` can serialize rather than parse. Does not prove validation is absent elsewhere |
| `AUTH_SECURITY_DISABLED` | P2 | Literal true assigned to the two security option names, including literal computed keys | Test fixtures/unrelated objects are not deployed auth configurations |
| `POTENTIALLY_UNBOUNDED_CONCURRENCY` | P2 | `Promise.all` with a direct mapped argument | Fixed arrays, prior bounds or a limiter inside the callback can make the operation safe |
| `TS_SUPPRESSION` | P2 | Directive-shaped `@ts-ignore`/`@ts-nocheck` comments at parser-established boundaries | Compatibility tests/runtime globals may justify them; this is not an exact simulation of compiler directive placement |
| `BROAD_DENO_PERMISSIONS` | P2 | Direct `deno run/test/serve/bench` task commands with `-A`/`--allow-all` before script/`--` | Tooling may need broad access; only root JSON/JSONC task strings or task `command` properties are examined |

JSON detection does not descend through validator calls or arbitrary object construction; wrapped calls, aliases, variables, custom validators and object spreads require manual review. Absence of a signal is not proof of validation. A bounded map is deliberately retained as a lead because syntax cannot establish its bound.

Deno detection does not evaluate shell commands: wrappers, chained commands, variables, combined short flags, task references and unrecognized options with separate values may be missed. Separate values for `--config`/`-c` and `--import-map` are supported. It ignores prose/comments and script arguments. Inspect the real deployment command and permission configuration separately.

Record each investigated signal once as fixed/verified, legitimate/retained or deferred with an open question. Never require blanket suppression, a comment per occurrence or removal of sound code to make the scanner quiet.
