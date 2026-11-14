# Contributing — prove TypeScript guardrails in context

Contributions should improve backend correctness and review quality without imposing ornamental architecture. Preserve feature-local **types/, interfaces/ and constants/**, keep runtime validators in schemas/, and avoid duplicate contracts or empty scaffolding. The scanner is a small CommonJS tool using the TypeScript compiler API; the executable backend example is TypeScript. Do not add a separate language/toolchain without a demonstrated need.

## Start with the actual library version

Read [SKILL.md](SKILL.md), the relevant reference and both package manifests/lockfiles. Apply **R0a** before using, cleaning or updating a library: verify the installed/resolved version and consult its official version-matched documentation.

For updates, compare current/target docs, migration notes, runtime support, peer dependencies and adapters. Explain why the task needs the change, keep unrelated dependencies unchanged and inspect lockfile diffs. Do not upgrade simply to follow a newer code sample.

Full validation uses Node **24.22.1** and the pinned package lockfiles. The scanner declares Node 22+; the backend example requires the documented Node 24 range. The tool's TypeScript **6.0.3** dependency supplies a JavaScript compiler API: a package with a newer version number is not proof that this API remains available.

## Proposing a guardrail or detector change

1. Reproduce a real failure or documented review risk with minimal input, exact versions and an observable consequence.
2. Include a valid counterexample: bounded Promise.all, deliberate test auth settings, validated input and justified type escapes must not become verified vulnerabilities.
3. Decide the evidence level. This scanner has syntax, not type resolution or data flow; its rules emit P2/P3 HEURISTIC leads. A confirmed application finding requires separate contextual proof.
4. Add positive/negative regressions in `scripts/ts-rails-regression.test.cjs` and CLI cases in `scripts/ts-rails-cli.test.cjs` as appropriate. Keep the original smoke test. Observe the intended failure before fixing it.
5. Cover syntax recovery/incomplete reports, source/test/config scope, deterministic locations, strings/templates/regex/JSX counterexamples, target immutability and exit behavior when relevant. Zero signals must not hide failed analysis.
6. If advice concerns tenant isolation, idempotency or transactions, use actual HTTP/SQLite behavior in `examples/backend/test/tasks.test.ts`. Do not substitute mocked method calls for evidence of rollback.
7. Document missed aliases/types/wrappers, false positives, compatibility and rollback in [the scanner contract](references/scanner.md) or the affected guide. Obtain skeptical independent review for substantive changes.

For guidance-only changes, apply the skill to a realistic task and check its decisions. Small prose corrections need focused document/link review, not tests that merely assert headings or wording.

## Local checks

Run from this repository's root (containing `SKILL.md` and `package.json`):

```sh
npm ci --ignore-scripts
npm --prefix examples/backend ci --ignore-scripts
npm run verify
```

The aggregate command runs scanner syntax validation and all scanner tests, then strict type checking and real HTTP/SQLite tests for the example. For iteration, `npm test` covers only the scanner; `npm --prefix examples/backend run check` covers the example. Run both before claiming full verification.

Keep dependency installation in this skill/example, not an audited backend. For an intentional dependency change, update and review the appropriate manifest/lockfile, then verify a clean `npm ci`. Do not bypass failing checks with automatic dependency upgrades.

[CI](.github/workflows/skill-ci.yml) runs full validation with Node 24.22.1 on Linux, macOS and Windows. The configured matrix does not prove Bun/Deno compatibility or hosted success until it actually runs.

## Safety and review evidence

- The scanner must never load a compiler or other executable module from the audited target by default. Preserve explicit trusted-compiler overrides and their validation.
- Keep source auditing read-only. Shell redirection or explicit report output writes only to an authorized destination.
- Keep parse/read failures, empty scope, skipped paths and unsupported syntax visible; `COMPLETE` describes selected syntax coverage, not application security.
- Preserve JSON/exit contracts or document their migration. Do not silently reclassify test fixtures as production vulnerabilities.
- Do not remove tests, change expected results blindly, add blanket suppressions or weaken strict typechecking to force green.
- Use synthetic fixtures or pinned, attributed upstream sources. Keep node_modules, credentials, reports containing private source and downloaded corpora out of contributions.

A useful PR includes the problem and minimal fix, positive/negative tests, a legitimate-use counterexample, versions/documentation consulted, commands/results including skips, limitations, compatibility/rollback and reviewer outcome. Changes to authentication examples must keep test adapters visibly separate from production authentication.

Workflow setup references: [Node setup action](https://github.com/actions/setup-node) and [checkout action](https://github.com/actions/checkout). External actions are pinned by commit; runtime/action updates require the same reviewed version and migration evidence.
