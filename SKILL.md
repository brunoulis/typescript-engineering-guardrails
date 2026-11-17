---
name: typescript-engineering-guardrails
license: MIT
description: Use when implementing, auditing, reviewing, refactoring or migrating TypeScript backends on Node.js, Bun or Deno, including Hono, Better Auth, Drizzle, PostgreSQL and identified TimescaleDB usage.
metadata:
  version: "2.0.0"
  family: "engineering-guardrails"
  tags: [typescript, node, bun, deno, hono, better-auth, drizzle, backend, security, architecture, anti-slop]
---

# TypeScript Engineering Guardrails

**Mission:** Generate and maintain correct, secure, legible TypeScript services with the fewest justified abstractions. A green `tsc` is a starting point, not proof of runtime safety, maintainability or production readiness. Prefer verified behavior, explicit trust boundaries, bounded work, and project conventions to fashionable architectures.

## 0. Activate intelligently

Choose operation: `audit` (read-only), `implement` (scoped change), `refactor` (behavior-preserving), `deep-refactor` (design alternatives + staged plan before broad migration). Choose profiles: `api`, `auth`, `database`, `worker`, `event-driven`, `library`, `prototype`, `migration`; combine as needed. Identify real runtime(s): Node, Bun, Deno, deployed target, versions and framework versions. Do not assume equivalent APIs.

Inspect first: repo rules, git status, `package.json`, lockfiles, `deno.json`, `tsconfig*`, framework bindings, project layout, tests, error/response contracts, deployments, environment config and CI. Confirm owner of each behavior. Establish a baseline for substantial changes; if unavailable write **NOT MEASURED/NOT VERIFIED**.

Load references *only as relevant*:
- `references/architecture.md`: module boundaries, minimal layering, coupling, dependency direction.
- `references/code-organization.md`: conventional `types/`, `interfaces/` and `constants/` folders per feature; optional shared counterparts; schema/source-of-truth rules.
- `references/anti-slop.md`: AI-generated code failure modes and proof obligations.
- `references/types-and-contracts.md`: strict TS, runtime validation, API contracts.
- `references/runtime-node.md`, `runtime-bun.md`, `runtime-deno.md`: runtime-specific verification.
- For Deno projects, derive checks from the Deno config/tasks/lock; use syntax triage plus native Deno checking when the Program adapter reports unsupported semantics. Test tasks may build native artifacts or need disposable services: inspect prerequisites before execution.
- `references/hono.md`, `better-auth.md`, `drizzle.md`: specialized libraries.
- `references/postgresql.md`: real PostgreSQL constraints, transactions, roles, RLS, pools and migrations, independently of the ORM; activate when PostgreSQL is actually used.
- `references/timescaledb.md`: identified TimescaleDB hypertables, partition-aware uniqueness, buckets, aggregates, columnstore and retention; do not presume the extension is installed.
- `references/security.md`: OWASP risks, tenants, authn/authz, supply chain.
- `references/async-performance.md`: queues, aborts, memory, profiling.
- `references/native-interoperability.md`: load for a measured CPU bottleneck, existing native dependency/capability or requested interoperability; TS algorithm/worker alternatives, one batched boundary, permissions and total-cost proof. TypeScript remains the default; preserve a working backend communicator. Consult Rust/C++ skills only if available and relevant, without requiring their installation.
- `references/testing-and-ci.md`: test pyramid, release gates, version-aware commands.
- `references/refactoring.md`: triage, parity, reversible migrations.
- `references/audit-protocol.md`: classification, evidence, independent review.
- `references/scanner.md`: setup, scope, completeness, rule limits, exit codes and the optional Deno integrations (`deno-check`, `deno-lint`, `deno-graph`, `deno-audit`) for Deno projects.
- `references/quality-score.md`: opt-in dependency graph and separate quality dimensions; scores are evidence summaries, not security grades or test coverage.
- `references/framework-signals.md`: import-aware framework leads, explicit external integrations and their source-snapshot limits.
- `references/corpus.md`: labeled corpus, counterexamples and reproducible measurements; no extrapolation to arbitrary projects.
- `references/code-evidence.md`: executable backend and pinned upstream counterexamples.
- `references/research.md`: Reddit observations and primary sources; anecdotes are not normative.

## 1. Non-negotiable rails

**R0 Ground before generating:** no invented APIs, benchmark gains, passing tests or version claims. Use current installed APIs/documentation. Verify the actual module/runtime and diff.

**R0a Version-aware library work:** before using a library API, cleaning/refactoring code that uses it, or updating the library, verify the exact version resolved in the affected package/workspace. Inspect installed package metadata or the package manager's read-only dependency inventory and compare it with the lockfile; a version range in `package.json` does not establish the installed version. If dependencies are absent or installation differs from the lockfile, state that explicitly instead of inventing a verified version.

Consult official documentation for that version **before changing library-dependent code**. Check the APIs, defaults, deprecations and runtime/adapter compatibility relevant to the change. If versioned documentation is unavailable, use the matching release/tag's documentation, changelog, declarations, source and tests; identify unresolved behavior as **UNVERIFIED**. A latest-version website, remembered API or pinned example in this skill is not proof of compatibility with the project's version.

For an update, establish both **current and intended target versions**, consult their documentation and the migration/release notes across the version gap, and check breaking changes, peer dependencies, runtime support, plugins/adapters and relevant database/schema migrations. Implement only an update requested or justified within the authorized task; keep unrelated dependencies unchanged. Cleaning code does not authorize a dependency upgrade, and a newer release alone is not a reason to upgrade.

Preserve observable contracts or explicitly identify intentional migration changes, inspect manifest/lockfile changes, and run the affected type checks, tests and runtime/integration checks. Report the versions, source links or local documentation paths consulted, reason for any update, and actual verification. Consult only the relevant APIs; reuse verified evidence while the resolved version and task assumptions remain unchanged.

**R1 Preserve observable contracts:** request/response shape, status, error mapping, authentication, authorization, ordering, side effects, DB schema, migrations, queues and webhook behavior. For refactors write regression/characterization tests first when feasible.

Unchanged exported types do not prove unchanged payload/event semantics, encoding or generated consumers. Map producer/channel/real consumer and runtime validation separately from static analysis. Version messages when independently deployed compatibility needs it, not every internal object. See `references/types-and-contracts.md`.

**R2 Zero ornamental architecture:** No controller→service→repository→interface→factory chain by default; no mandatory classes, DI container, hexagonal layers, microservices, packages or monorepo. Each new abstraction must identify an actual change boundary, dependency or testing problem. Keep trivial CRUD simple. Compare smallest change with a more modular alternative.

**R2a Explicit code organization (project preference):** Prefer dedicated `types/`, `interfaces/`, `constants/` directories inside each feature; create `shared/types/`, `shared/interfaces/`, `shared/constants/` only for genuinely shared definitions. Locate runtime validators in `schemas/`, not `types/`. Keep files close to their owners, avoid duplicate interface/type/schema declarations, empty folders and needless interface-per-class boilerplate. See `references/code-organization.md`. Existing project conventions prevail unless the user requests a migration.

**R3 Own the boundaries:** validate `unknown` data from HTTP, webhooks, queues, ENV, external APIs and DB assumptions where trust demands it. Type annotations do not validate runtime inputs. Never pretend `as`, `!`, `any`, or `JSON.parse(...) as T` establish truth.

**R4 Security is contextual but compulsory:** authentication is not authorization. Prove object- and property-level authorization, tenant scoping, privilege checks, secret hygiene, CSRF/origin/cookie assumptions, replay protection for signed webhooks, and bounded request resources. Do not invent a security bypass to make tests pass. A dependency advisory needs reachability from real entrypoints and a fix version before any upgrade; R0a still governs the upgrade itself.

**R5 Explicit dependency direction:** HTTP adapter knows the application logic; domain/pure logic should not depend on Hono context, global singleton state or framework request objects without justification. Cross-feature imports use intentional public APIs; no automatic 'common' extraction.

**R6 Async/resources:** external I/O has appropriate timeouts/cancellation and retry budgets; background jobs have owners, limits, shutdown behavior and idempotency policy. Avoid unbounded `Promise.all`, unbounded buffering and event-loop blocking.

**R7 Database invariants:** ensure tenant/owner predicates, constraints, atomic transactions where required, migration compatibility, indexes justified by query evidence, pagination, N+1 awareness and safe SQL parameterization. Drizzle type inference does not prove authorization or transaction correctness. For PostgreSQL, keep all transaction operations on the same acquired/reserved client or ORM transaction object; test failures and concurrent clients against the real server. Prove adopted RLS with the effective non-owner/non-superuser role, including USING/WITH CHECK and pool context reuse. For TimescaleDB, partition-inclusive uniqueness and refresh after raw retention require real extension tests; the auditor never connects to a database or infers all dynamic policies.

**R8 Test meaningful paths:** characterize success, invalid input, missing/expired session, forbidden resource, tenant boundary, partial DB failure, cancellation, race/retry, and observable API contract as relevant. Don't add tests merely to increase coverage percentages.

**R9 No speculative optimization:** profile actual workload, capture p50/p95/p99, throughput, RSS/heap, DB time and event-loop lag when relevant; compare before/after on same conditions. Caches, workers and runtime migration need evidence.

For native work, compare algorithm/data layout and a TypeScript worker with IPC/FFI/Node-API/Wasm; `deno_core` is for custom runtime embedding. Require a demonstrated total advantage or necessary existing capability, explicit contract/ownership/batching/failure cleanup and deployment proof. Measure total CPU/RAM and end-to-end tails; a faster kernel with worse overall cost can warrant keeping TS. See `references/native-interoperability.md`.

**R10 Small safe diffs:** inspect user changes; avoid unrelated rewrites, blanket formatting or automatic dependency upgrades. No destructive commands without explicit authorization; never modify a project during `audit`.

**R11 Explain exceptions:** flag evidence and uncertainty; allow justified `any`, type assertions, DI, repositories, retries and classes. No severity assigned from file length, regex match, folder name or a single interface alone.

**R12 Separate authorship from review:** independent audit or adversarial skeptical pass; verify claimed fixes and untouched risks. Re-read skill at handoff in long sessions.

## 2. Required execution loop

1. **Discover:** identify actual runtime, use cases, trust boundaries, behavior, commands, deployment, existing conventions, changed files and baseline. For library usage, cleanup or upgrades, apply R0a before choosing APIs or changing code. For `audit`, remain read-only.
2. **Map:** request path → validation → authentication → authorization → application logic → transaction/persistence → response; map job/webhook paths separately. Sketch modules and dependency direction only where needed.
3. **Inspect:** for audits or substantial changes, use the bundled auditor as *triage* when available, then compiler/linter/tests/dependency and runtime-specific checks that genuinely exist. Syntax is the default; typed analysis, quality dimensions and external integrations require explicit selection. Check scope and diagnostics before interpreting signals. `COMPLETE` describes the selected analysis, not application safety. Missing typed context, selected files outside the program, failed integrations and zero inspected files cannot support a clean audit. Verify each candidate in context. Auditor signals **are not established vulnerabilities**.
4. **Design:** compare (A) minimal targeted fix, (B) larger refactor; explicitly assess coupling, cognitive load, testability, compatibility, rollback, operational burden. Extraction only if benefit is established.
5. **Implement:** smallest coherent reversible diff, preserving contracts unless explicitly requested otherwise.
6. **Verify:** repeat checks plus role/tenant/security regression; run deployment-runtime smoke tests where compatibility matters. Report exact commands/results, mark unexecuted checks.
7. **Independent review:** examine design slop, missing invariants, boundary trust, race conditions, hidden global state, dependency proliferation, performance claims and residual risks.

Read-only triage (prepare inside the skill with `npm ci --ignore-scripts` and `npm run build`; Node >=22.13.0 is required by the whole tool dependency set, and local full checks use Node 24.22.1):

```bash
node .agents/skills/typescript-engineering-guardrails/scripts/ts-rails-audit.cjs --root . --format text
node .agents/skills/typescript-engineering-guardrails/scripts/ts-rails-audit.cjs --root . --format json > ts-rails-findings.json
node .agents/skills/typescript-engineering-guardrails/scripts/ts-rails-audit.cjs --root . --path src --exclude-tests --format json
node .agents/skills/typescript-engineering-guardrails/scripts/ts-rails-audit.cjs --root . --mode typed --project tsconfig.json --score --format json
```

The legacy `.cjs` entry is generated from strict TypeScript; do not edit generated JavaScript. See `references/scanner.md` for JSON configuration, baseline/SARIF contracts and exit policies. The JSON redirection writes a report: in read-only audits, choose an authorized report destination outside the audited project. Explicit baseline creation is a separate authorized write; incomplete scans cannot create baselines. A missing compiler is an error, not a reason to install or modify dependencies in the target. The skill's pinned compiler is independent of the target compiler; report the version actually used.

`--integration knip` and `--integration dependency-cruiser` run pinned tools on selected source snapshots, sanitized root dependency metadata and tool-owned temporary configuration, with Knip plugins disabled. They do not run target scripts/configuration or copy target node_modules. Their export/file/dependency/cycle leads describe only that snapshot; unused-dependency candidates still require checking real assets, framework configuration and workspace entry points. Use the explicit type-aware typescript-eslint recipe for promise linting in a trusted project rather than treating the auditor as a replacement linter.

## 3. Severity / confidence

- **P0 BLOCKER:** verified auth bypass, cross-tenant access, secret exposure, data corruption, exploit path, failed critical correctness contract.
- **P1 HIGH:** verified unbounded resource path, unsafe transaction behavior, missing authorization in privileged flow, production crash/leak with strong evidence.
- **P2 MEDIUM:** plausible design flaw or performance risk, type escape at trust boundary, risk needing tests, preventable coupling with concrete cost.
- **P3 LOW:** readability, style, possible consolidation or optional design improvement.

Record separately `CONFIRMED`, `LIKELY`, `HEURISTIC`, `UNKNOWN`; do not call an AST search a verified vulnerability. A high-impact unverified concern merits urgent investigation, not a fabricated finding.

The scanner emits P2/P3 `HEURISTIC` leads only, with `source`, `test` or `config` scope. For each reviewed lead, record one disposition: **fixed and verified**, **legitimate use retained**, or **investigation deferred** with the unresolved question. A test deliberately disabling origin checks, a bounded map, or a fallback catch may be legitimate. Keep valid code without repeated comments or suppressions merely to silence the tool; `--fail-on-signals` is an opt-in signal policy, not a security gate.

## 4. Handoff contract

For a small correction, explain the change, actual validation and remaining uncertainty briefly. For substantial work provide: detected runtime + versions; scope including skipped paths/parse diagnostics; contract/invariant list; findings `[severity, confidence, file:line, evidence, impact, smallest fix, verification, disposition]`; design alternatives and rejection reasons; files changed; exact checks executed + outputs; before/after metrics or UNMEASURED; residual risks, rollback and independent-review result.

Use the compact change-surface and verification blocks in `templates/audit-report.md`: base/candidate/diff identity; file/reason and semantic before/after; endpoints/jobs/events, DB effects and actual consumers; new retry/cache/resource state owner and closure; observed versus inferred scenario inventory/denominator; before-fail/after-pass evidence or explicit gap; feature-off/conditional runtime evidence; first proposal versus current complexity. Attribute findings to introduced/pre-existing/unknown and retain legitimate uses or accepted limits with reasons. Neither severity labels nor review counts establish defects or justify churn.

Per contract, separate built/tested/integration/release evidence and record exact runtime/OS/feature/framework/driver/server/package/artifact, command/exit, selected/executed/pass/fail/skip/disabled counts, location/date and candidate freshness. Use PASS/FAIL/UNVERIFIED/N/A with reasons; unknown counts stay unknown. Zero/all-skipped/stale tests cannot verify behavior; a runner failure stays FAIL. Connect effective lock/overrides/forks and build to distributed package/consumer only when applicable. Logging needs activation/frequency/sink/volume/redaction and contextual blocking/backpressure evidence. Scale local changes with justified N/A; add no infrastructure merely to fill fields and do not change auditor JSON/SARIF formats for this documentary contract.

For HTTP/SQL flows, choose evidence that matches the integration: `examples/backend/README.md` covers fast Hono/SQLite regression with injected identity; `examples/postgres-backend/README.md` covers actual Better Auth sessions, Drizzle, persisted membership, tenant/owner predicates, concurrent idempotency and PostgreSQL task/outbox rollback. `examples/data/README.md` covers dedicated PostgreSQL/TimescaleDB roles, RLS, pools, migrations and actual Node/Bun/Deno driver executions. These packages own independent locks and destructive local fixtures; never reuse production services or credentials. Runtime execution and configured CI are separate claims. Preserve feature-local `types/`, `interfaces/`, `constants/` and `schemas/` only where needed.

Use `templates/audit-report.md`, `templates/project-profile.md` and `templates/refactor-plan.md` as needed. Project's explicit conventions outrank optional stylistic suggestions but never justify proven security/correctness defects.
