# Labelled corpus, measurements and CI

`tool/bench/corpus.ts` contains 20 small synthetic fixtures and one attributed upstream-derived fixture. Each fixture has a literal desired indication count, a named rule, and source text chosen independently of the auditor. Both syntax and typed audit APIs run against separate temporary projects, with complete compiler diagnostics and target content/inventory hashes retained. The target modules are never executed. The report does not relabel its own findings as truth.

The eight original rules each have a positive and a negative fixture: explicit any, non-null assertions, empty catches, raw JSON assertions, authentication toggles, mapped concurrency, TypeScript suppressions, and broad Deno task permissions. Four additional fixtures compare a builtin JSON alias, shadowed JSON object, small static tuple, and large static tuple. The desired labels deliberately expose syntax limitations: a builtin alias is missed, a shadowed object is flagged, and a small tuple remains a review signal in syntax mode. Typed symbol/type evidence changes those outcomes.

The upstream fixture adapts the JSON.parse declaration from [Microsoft TypeScript v6.0.3, src/lib/es5.d.ts](https://github.com/microsoft/TypeScript/blob/v6.0.3/src/lib/es5.d.ts), copyright Microsoft Corporation, Apache-2.0 ([upstream license](https://github.com/microsoft/TypeScript/blob/v6.0.3/LICENSE.txt)). Its method signature is unchanged; the surrounding interface is renamed/exported and placed in a `.ts` fixture because declaration files are normally excluded. Four explicit-any nodes are expected heuristic signals in this legitimate public API contract. This is one narrow upstream-derived case, not an audit of the TypeScript repository or a representative third-party benchmark. No cloned repository or dependency cache is redistributed.

Counts represent indications: `TP=min(desired,actual)`, `FP=max(actual-desired,0)`, `FN=max(desired-actual,0)`. Multiple findings of the labelled rule are counted; incidental other rules do not change that fixture's labels. A test independently checks the counting function with missing and excess findings. The corpus test asserts literal totals and requires complete reports and unchanged targets.

| Current labelled corpus | True positives | False positives | False negatives |
| --- | --- | --- | --- |
| Syntax: 21 fixtures | 13 | 2 | 1 |
| Typed: same 21 fixtures | 14 | 0 | 0 |

These are desired **heuristic indication** labels, not confirmed vulnerability labels. Results apply only to these 42 case-mode executions. They do not estimate real-world precision/recall, validate security, or cover every feature of the newer architecture/framework/database rules. Those have separate regression suites.

## Reproduce

From the repository root:

```sh
npm ci --ignore-scripts
npm run build
node --test dist/tool/test/corpus.test.js
node dist/tool/bench/run.js
# Optional alternative destination, including in CI:
node dist/tool/bench/run.js --output /tmp/guardrails-benchmark.json
```

The default measurement destination is `docs/verification/benchmark-v2.json`. It records the actual OS/CPU/runtime, git base, auditor and benchmark source hashes, fixture hashes and sizes, every measured sample, medians, min/max and IQR. The runner rejects source changes during measurement, incomplete child results, wrong file counts, target mutations and failed/timed-out child processes.

## Measurement method

`tool/bench/fixture.ts` deterministically generates 20 and 100 source files, each with one function containing 40 arithmetic operations, an uncapped mapped Promise.all, a raw JSON assertion, and a previous-module dependency. Both modes inspect identical content with `score:false` and no external adapters. Typed mode necessarily includes compiler context and dependency analysis; its context-file count is recorded separately. No target script, build, database or application module executes.

Each mode/size runs in a new Node child process for one discarded warmup and five retained samples, sequentially. `auditMs` surrounds only the audit call after compiler loading. `processWallMs` includes child startup, compiler load, hashing and reporting. `peakRssBytes` converts Node `process.resourceUsage().maxRSS` from KiB to bytes and includes the whole child/TypeScript compiler; `endingRssBytes` is also recorded. These are process memory measurements, not an allocation attribution to one rule. Quartiles use R-7 linear interpolation.

OS file caches, CPU scheduling, background applications and garbage collection are uncontrolled. One discarded fresh-process warmup does not create a warm persistent compiler process. There is no before/after implementation comparison, claimed optimization, universal budget, or CI performance threshold. The measured JSON provides a reproducible starting point for a later equivalent comparison; differing fixtures/modes/machines/settings must not be compared as improvements.

## Runtime and database CI contracts

The existing Node core job now runs `npm run verify` on Windows, macOS and Linux using Node **24.22.1**, with the labelled corpus included in normal tests. Linux also runs the separate-process benchmark with a runner-temporary output path.

A single Linux data job installs Node **24.22.1**, Bun **1.3.10** and Deno **2.9.8**, asserts their actual executable versions, and provisions the dedicated PostgreSQL/Timescale containers via `examples/data`'s `db:up`. That provisioner owns digest verification, loopback binding, fixture labels, readiness checks and cleanup. The backend's `db:prepare` creates its separate restricted login/database in the owned PostgreSQL container.

The job executes these groups sequentially because suites reset shared schemas:

1. Data strict typecheck, Node PostgreSQL/Timescale tests.
2. Actual Bun TypeScript runtime contracts.
3. Deno check, Deno tests, and missing-permission subprocess checks.
4. The PostgreSQL backend's strict check and real authentication/HTTP/persistence suite, with explicit public fixture URLs for migration and restricted app roles.
5. `db:down` in an `always()` cleanup step after all database work.

The workflow does not infer Bun/Deno coverage by executing Node. The data job's containers are Linux fixtures using pinned digests from the provisioner; no production URL or cloud account is required. Local database execution results are recorded in `examples/data/README.md` and `examples/postgres-backend/README.md`. This workflow has been parsed locally but has not been run on GitHub; cross-platform job success and hosted-runner provisioning remain CI evidence to collect after a deliberate push.

Third-party setup actions are pinned to full commits, with version inputs checked against their official action definitions:

- [oven-sh/setup-bun, 0c5077e51419868618aeaa5fe8019c62421857d6](https://github.com/oven-sh/setup-bun/blob/0c5077e51419868618aeaa5fe8019c62421857d6/action.yml), resolved from upstream `refs/tags/v2`; Node 24 action runtime, explicit `bun-version: 1.3.10`.
- [denoland/setup-deno v2.0.4, 667a34cdef165d8d2b2e98dde39547c9daac7282](https://github.com/denoland/setup-deno/blob/667a34cdef165d8d2b2e98dde39547c9daac7282/action.yml), resolved from that upstream tag; Node 24 action runtime, explicit `deno-version: 2.9.8`.

The existing full-commit checkout/setup-node pins remain in place. Runtime installers are CI provisioning tools; their inputs are not read from an audited project's executable configuration.


## Executed measurement snapshot

The checked-in [measurement artifact](../docs/verification/benchmark-v2.json) was generated on Windows x64 with Node 24.22.1 on 2026-11-16 at 19:44:59 UTC. All retained child samples and all 42 corpus case-mode executions were complete, with unchanged target hashes. Its auditor source SHA-256 is `69a0e582264c12eaf7e730ead14ad66ac4134f29493eb887e1e9163571797fcc`; source edits require a new run before treating these measurements as current.

| Mode | Source files / bytes | Audit median / IQR (ms) | Median process peak RSS (MiB) |
| --- | --- | --- | --- |
| Syntax | 20 / 25,189 | 95.3 / 1.6 | 90.0 |
| Typed | 20 / 25,189 | 1,408.5 / 56.0 | 303.4 |
| Syntax | 100 / 126,229 | 286.7 / 20.8 | 107.8 |
| Typed | 100 / 126,229 | 2,168.9 / 111.5 | 317.5 |

The artifact contains the five individual retained measurements per scenario and broader machine/context metadata. These values are observations on the defined fixture and machine; they establish no production budget or performance improvement.
