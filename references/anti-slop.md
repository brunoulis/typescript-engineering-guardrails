# Anti-slop quality gates for AI-generated TypeScript

**Anti-slop is not minimizing lines:** require focused intention, explicit invariants, correct async behavior and reviewable diffs.

## Suspect patterns — inspect, do not blindly flag
- One-interface-per-class, one-method services, generic `BaseRepository<T>` that hides distinct query semantics, factories without runtime variability, dependency injection containers added to a small Hono app. **A dedicated `interfaces/` folder is an organization convention, not a requirement to invent interfaces.**
- Copy-pasted input/output DTOs, duplicated validators, shadow types with different meanings, `any` replacing actual domain modeling, assertions on `response.json()`.
- Catch-all `try/catch` returning `null`, 200 responses for errors, error normalization that loses original cause or sensitive exception details returned to clients.
- Route handlers combining validation, auth, business decisions, network retries, SQL, formatting and notifications with no test seams.
- Object spread into ORM update allowing mass assignment; `tenantId`/`userId` read from request body without independent authorization.
- `await Promise.all(rows.map(...))` with potentially large rows; timers/streams/connections without lifecycle or cancellation; unlimited retries and recursive background jobs.
- Overuse of `singleton` import graphs, global mutable caches, duplicated sources of truth; unnecessary custom wrappers around stable existing library APIs.
- Large agent PRs mixing migration + formatting + refactor + new feature; invented 'best practice' claims; tests that only check mocks/implementation details.

## Proof obligation before any abstraction
Document: (a) actual pain or change pressure; (b) alternatives considered, including keeping code local; (c) coupling reduced; (d) extra moving parts; (e) test and rollback implications. If unsupported, keep simpler design.

## Agent execution rule
The implementer must point to existing neighboring code and preserve conventions. Reviewer looks for pointless layers, meaningless indirection, incorrect authority boundaries, unnecessary `as`/`!`, test gaps and unsupported performance claims. No automatic refactor solely for aesthetics.

## Churn and regression surface

Compare the first proposal with the current candidate when a repair accumulates flags, retries, caches, timers, queues or new layers. Record new/removed states, dependencies, abstractions and lifecycle obligations, the finding that motivated each, and why a local correction cannot meet the contract. Reconsider an addition whose purpose is to repair the preceding workaround. A necessary new state can be legitimate; neither LOC growth, number of revisions nor a fixed percentage decides quality.

For changed resources/state identify owner, mutators, reset/invalidation/cancel/disposal and failure/shutdown paths. Map existing/new files to changed endpoint/job/event semantics, DB effects and actual consumers. Keep observed inventory separate from inferred paths and executed paths; report the affected-scenario denominator only when established. Use the [report](../templates/audit-report.md) fields once, not parallel checklists. A comment-only local change can use justified N/A and a brief handoff.

## Quality review questions
Can a new developer trace endpoint→SQL in minutes? Can the core rule be tested without Hono? Could this change leak another tenant's data? Is the new abstraction used or clearly justified? Does every async operation have failure handling? Could the same behavior be expressed with fewer concepts? Did the PR preserve contracts?
