# Refactoring and migration protocol

Modes: `refactor` scoped and behavior preserving; `deep-refactor` may alter boundaries but requires decision record and staged compatibility plan; `migration` compares runtimes/framework versions with parity tests.

For library-dependent cleanup, apply **SKILL.md R0a** first: establish the installed version and consult its corresponding official documentation. Do not replace working APIs merely because examples for a newer version use a different style. A deprecation must apply to the project's version; its removal or replacement is a scoped decision, not an automatic upgrade.

For a requested or justified library update, compare the installed and target versions, their documentation and intervening migration notes before editing. Separate the dependency/API migration from unrelated cleanup, verify affected contracts and runtime/driver/plugin compatibility, and report the exact version change, sources and checks.

1. Inventory public API, payloads, errors, auth checks, DB side effects, queue semantics, cron timings, config and dependency consumers.
2. Establish tests/golden fixtures, including errors and unauthorized cases. Mark existing failures.
3. Triage by impact and evidence: correctness/security first, coupling/duplication next, style last. Don't use LOC threshold as automatic smell.
4. Compare minimal repair with structural extraction and quantify extra concepts. Consider a strangler-style staged adapter only when migration demands it.
5. Move code without behavior changes first; change semantics in separate diff. Validate imports/public API, circular dependencies, deployment packaging and startup.
6. Prove parity: HTTP snapshots, DB schema/migrations, event/outbox behavior, idempotency, metrics, authz tests and performance as relevant.
7. Independent reviewer tries to demonstrate a contract violation and overengineering. Document rollback and residual debt.

For Node→Bun/Deno migration, test actual native packages, `node:` API compatibility, worker model, instrumentation, env/cookies, TLS, DB drivers and permissions. Never assume compile success proves runtime parity.

Use the [change-surface report](../templates/audit-report.md) for file/reason → semantic before/after → endpoint/job/event/DB effect → real consumer → evidence. Include new retry/cache/timer state owners, invalidation/closure and failure/shutdown; unknown affected-path denominator, missing before-fail/after-pass or feature-off evidence remain explicit. Keep findings introduced by the change distinct from prior debt and reviewer labels.

If revisions add state, dependencies, layers or lifecycle rules, compare first proposal with current candidate and the smallest workable correction; see [churn review](anti-slop.md). A necessary state is allowed; extra workaround flags do not become justified through review count. Connect effective lock/overrides/forks and preparation/build output with the distributed package's actual consumer smoke test. Do not install another service matrix for a report. For justified CPU/native work, use the optional [native decision record](../templates/refactor-plan.md) and preserve the backend's existing communicator while it meets requirements.
