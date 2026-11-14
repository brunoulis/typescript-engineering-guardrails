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

Independent review: review existing diff from clean context if available; check changed behavior and unchanged vulnerable paths; ask whether proposed fixes introduce extra abstractions or hidden costs.
