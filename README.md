# TypeScript Engineering Guardrails — Node, Bun, Deno

A portable backend engineering skill for audit, implementation and behavior-preserving refactoring. **Preferred convention: feature-local `types/`, `interfaces/` and `constants/`; shared definitions only when genuinely shared; runtime validators in `schemas/`.** Existing project conventions and scoped changes take precedence over unnecessary rearrangement.

Version **1.2.0** adds reproducible tooling, regression tests, explicit incomplete reports, a real Hono/SQLite example and pinned upstream source evidence. The scanner remains syntax triage; it does not certify a backend's security.

## Install and prepare

See [INSTALL.md](INSTALL.md) for folder/skills CLI installation, Codex/Claude Code/Hermes paths, language-scoped activation and discovery checks. The instructions can be installed without preparing the optional scanner; your types/interfaces/constants convention remains part of the skill.

Place this skill folder in your agent's supported skill directory (for example `.agents/skills/typescript-engineering-guardrails/`). Include scripts, references, templates and examples. Development audit logs and corpus clones live outside this folder.

To use the scanner, prepare its dependency **inside this folder**, not the audited project:

    npm ci --ignore-scripts
    npm test
    npm run check

Node 22+ runs the scanner; validation used Node 24.22.1. The lockfile pins TypeScript **6.0.3**, which exposes the JavaScript compiler API used here. The target project's compiler is not automatically loaded. A deliberately selected trusted compiler can be supplied through an absolute `TS_RAILS_TYPESCRIPT_PATH`; an invalid override fails. No automatic target install, lockfile update, compiler upgrade or source fix occurs.

## Use

Example agent request:

> Use typescript-engineering-guardrails in audit mode with api, auth and database profiles. Read-only. Identify deployed versions; inspect validation, tenant permissions, transactions, async limits and unnecessary abstractions. Report evidence, confidence, minimal remedies and verification. Keep our types/interfaces/constants convention.

From this skill directory:

    node scripts/ts-rails-audit.cjs --root /path/to/backend --format text
    node scripts/ts-rails-audit.cjs --root /path/to/backend --path src --exclude-tests --format json

Use an absolute script path from other directories. JSON is written to stdout; shell redirection writes wherever you specify, so choose a permitted report destination.

The eight rules cover explicit any, non-null assertions, empty catches, raw JSON assertions, security toggles, mapped Promise.all, TS suppressions and broad Deno task permissions. Findings are P2/P3 `HEURISTIC` leads. Scope is reported as source/test/config; an auth test is not a production vulnerability.

Exit `0` means a complete scan of the selected syntax, `1` means an execution/configuration/incomplete-analysis error, `2` means signals triggered the explicit `--fail-on-signals` policy. A zero-signal report never proves security. See [scanner contract and limitations](references/scanner.md) for scope, skipped files, diagnostics and programmatic APIs.

## Executable backend example

The independent [Hono + SQLite package](examples/backend/README.md) demonstrates the folder convention with an injected authentication port, strict input schemas, actor/tenant predicates, scoped idempotency and an atomic outbox write:

    npm --prefix examples/backend ci --ignore-scripts
    npm --prefix examples/backend run check

Use the example's documented Node 24 version. Tests exercise actual Hono Request/Response handling and SQLite, including a trigger-induced database failure. Authentication tokens are test fixtures; no production session adapter, Better Auth integration, Drizzle driver or distributed delivery is implied.

After both installs, `npm run verify` runs scanner syntax/tests and the example's strict typecheck/tests.

## Recorded validation — 2026-11-14

- Scanner: **57 tests**, including positive/negative rule cases, original regressions, CLI failures, malformed syntax/config, scope selection, source immutability and prevention of target-controlled compiler loading.
- Backend: **11 HTTP/SQLite integration tests** plus strict type checking. Temporary mutations removing tenant scope, actor scope or transactions were detected by the tests; originals were restored and verification repeated.
- Pinned Hono `src`: **314 files**; Better Auth `packages/better-auth/src`: **392 files**, with no parse diagnostics. Optional test exclusion inspected 189 and 281 files respectively.
- Source hashes and Git status remained unchanged during the upstream scans. Upstream dependency installation, build and test suites were **not executed**.

See [code evidence and counterexamples](references/code-evidence.md). Raw reports, red/green logs, revisions and a reproduction script are in the development workspace's `docs/audits/2026-11-14-typescript/`. These checks do not establish scanner precision/recall, production security, performance improvements, Bun/Deno runtime compatibility or general agent productivity.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for positive/negative regressions, real backend checks, version-matched documentation and the read-only scanner contract. [CI](.github/workflows/skill-ci.yml) runs the scanner and HTTP/SQLite example on Linux, macOS and Windows using the pinned Node baseline.

## Organization and review

[Code organization](references/code-organization.md) preserves dedicated feature-local declarations without empty folders, duplicate schema types or one interface per class. The example follows that convention.

For each scanner lead, record one decision: fixed and verified; legitimate use retained; or investigation deferred with a concrete open question. A documented fallback catch or intentionally disabled test security setting may remain unchanged. Do not add artificial abstractions or blanket suppressions to make signals disappear.
