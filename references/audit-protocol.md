# Deep audit protocol (no false precision)

Map layers: trust entry → validation → authn → authz → domain transitions → SQL/queue/side effects → transport response. Also map config/runtime → deployments/operability.

Audit each relevant path for:
- correctness (ordering, invariants, null handling, error semantics);
- security (BOLA/BOPLA, tenant, CSRF, SSRF, injection, secrets, privilege);
- type safety (unsafe escape, external JSON schema, transformations);
- architecture (cohesion, cycles, changes touching many modules, duplicated business rules, unnecessary concepts);
- async/resilience (blocking, unbounded work, timeout, retry, shutdown, replay);
- persistence (atomicity, migrations, indexing, bounded result set);
- verification (real boundary tests, change risk and observability).

Findings require: actual `path:line`, relevant snippet, reachability/trigger, impact, confidence, smallest viable fix, specific verifying test. Never infer an exploit from a bare match to `as`, `any`, `Promise.all` or `disableCSRFCheck` without proving deployed context. Elevate to P0/P1 when evidence establishes impact. Collect deferred debts separately. Be skeptical of both overengineering and underengineering.

Identify base/candidate revisions and dirty diff, then attribute each reviewed concern to introduced regression, pre-existing debt or unknown. A prior defect can matter without becoming a regression or mandatory unrelated repair. A reviewer's severity label or repeated review is not corroboration: record mechanism, consequence and evidence, disputed findings and disposition (fixed and verified, legitimate use retained, accepted in-scope limit, or investigation deferred with reason/question). Preserve the auditor's existing JSON/SARIF and confidence/scope conventions; these are documentary fields, not new scanner findings.

Follow each changed payload/event to its real producer and consuming endpoint/job/client, even if exports remain identical. Separate static/type analysis from runtime parsing and consumer execution. If a consumer is inaccessible, describe accessible evidence and leave its compatibility UNVERIFIED. Include new state ownership/closure, feature-off/conditional import paths, contextual logging/backpressure and complexity churn in the [report](../templates/audit-report.md). Test counts, runtime/integration identity and fresh evidence belong to each contract row; an exit code alone cannot establish preservation.

Independent review: review existing diff from clean context if available; check changed behavior and unchanged vulnerable paths; ask whether proposed fixes introduce extra abstractions or hidden costs.
