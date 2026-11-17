# Backend audit report

**Scope / commit / date:**
**Base/candidate revisions, dirty diff identity and compared range:**
**Mode and profiles:**
**Runtime/framework/deploy verified:**
**Threat boundaries and critical business contracts:**
**Scanner/compiler version, selected paths, completeness, parse/read errors and exclusions:**

| Severity | Confidence / scope | Path:line | Trigger & actual evidence | Impact | Attribution (introduced / pre-existing / unknown) | Minimal remediation | Proof/test | Disposition |
|---|---|---|---|---|---|---|---|---|

Disposition: fixed and verified / legitimate use retained / accepted in-scope limit / investigation deferred (state reason, unresolved question and evidence). A reviewer label alone proves neither severity nor attribution. Separate introduced risk from prior debt without requiring unrelated repairs.
Scanner P2/P3 leads are separate from verified application findings. No findings from an incomplete scan is not evidence of safety.

## Change surface (for a change under review)
| Existing/new file and reason | Observable behavior/contract before → after | Endpoint/job/event, DB effect and real consumer | Evidence or gap |
|---|---|---|---|

- Observed inventory/exclusions versus inferred paths; affected scenarios and denominator if known (unknown is not zero):
- New/changed retry/cache/queue/timer/resource state → owner/mutator → reset/invalidation/cancel/disposal; necessity and failure/shutdown behavior (or justified N/A):
- Regression failing before/passing after, with both candidate identities; if unavailable, reason and limit. Distinguish characterization or new-feature checks:
- Feature-off, conditional imports and other supported runtimes/targets: preservation evidence, intentional authorized change or UNVERIFIED:
- First proposal → current candidate: added/removed states, dependencies, abstractions and lifecycle rules; which findings justified each and whether simplification still works. Do not invent intermediate revisions or use LOC/review count as proof:

## Architectural anti-slop review
- Layers justified / ornamental abstractions:
- Coupling, cycles, feature ownership:
- Duplicate contracts/types / dead code:
- Smallest change vs larger option:

## Verification
| Contract/scenario | Dimension (built / tested / integration / release) | Runtime/OS/feature, framework/driver/server/package and artifact identity | Exact command/job and exit | Selected / executed / passed / failed / skipped / disabled | Result (PASS/FAIL/UNVERIFIED/N/A), reason | Evidence location/date and candidate freshness |
|---|---|---|---|---|---|---|

Use N/A counts for non-test rows, unknown for unknown counts. Zero executed, all-skipped, stale or unavailable tests cannot verify behavior. Preserve actual runner failures as FAIL while unmet contract verification remains UNVERIFIED. Report partial coverage and outstanding checks; a Node auth result does not establish that integration on Bun/Deno. Static analysis and runtime boundary validation are separate rows. See [verification guidance](../references/testing-and-ci.md).

## Distribution (when applicable)
- Manifest/lock versus effective installed selection; overrides/forks/local patches and reasons:
- Exact build/package preparation and distributed artifact, native binary/module if present, and consumer smoke/integration exercising that identity:
- Test-to-release identity mismatch or conditional target not exercised: UNVERIFIED. Local-only changes without distribution: justified N/A. Do not add services or release infrastructure to fill this section.

## Performance
Measured before/after (or UNMEASURED):

Logging: activation/request-event frequency, sink/synchronous work, controllable volume/redaction and measured cost or gap. Event-loop blocking/backpressure: workload, evidence and existing isolation; rare/throttled/diagnostic logs can be legitimate. Native proposal: link the optional [native decision record](refactor-plan.md), do not infer a total gain from a kernel benchmark.

## Unverified risks / residual debt / rollback / independent reviewer
