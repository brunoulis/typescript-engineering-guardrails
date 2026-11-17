# Behavior-preserving refactor plan

1. Business behavior and observable contracts (including auth & errors):
2. Current evidence/problem with path:line:
3. Option A: targeted minimal fix; costs:
4. Option B: structural refactor; benefits/costs:
5. Chosen option and reason, including why NOT introduce new layers:
6. Characterization tests and migration parity matrix:
7. Staged diff/rollout/feature flags when necessary:
8. Database/worker/runtime compatibility and rollback:
9. Commands actually run and results:
10. Independent reviewer verdict and deferred debt:

Use the [audit report](audit-report.md) change-surface and verification rows rather than duplicating a large report here. Record base/candidate/diff identity; semantic payload/event changes even with the same exported type; endpoint/job/DB effects and actual consumers; new retry/cache/resource owner and closure; affected scenario inventory and unknown denominator; before-fail/after-pass evidence; feature-off and supported runtime gaps. Compare first proposal with current state/dependencies/abstractions/lifecycle complexity and explain necessary additions without LOC quotas.

For deployed producer/consumer compatibility, name message versions, decoding/error/ordering rules and real consumer tests as relevant. A versioned envelope is not mandatory for internal objects. Tie installed lock/override/fork selection and build output to the package actually exercised; preserve existing CI/fixtures and mark unexecuted runtime/driver/server combinations UNVERIFIED.

## Optional native decision record

Use only for a measured CPU bottleneck, required existing native capability or requested interoperability. Follow [native interoperability](../references/native-interoperability.md); TypeScript is the default.

| Question | Evidence / decision / unresolved check |
|---|---|
| Baseline identity, workload and CPU bottleneck or capability required | |
| Alternatives: local TS algorithm/data layout, TS worker, IPC, FFI, Node-API, Wasm | Keep/reject each with contextual reason; no prototype per mechanism required |
| Existing communicator and chosen single operation boundary | Preserve a working communicator; justify mechanism and batching |
| Contract/consumer | Runtime input/result/error validation, numeric/encoding limits, version compatibility where needed; generated binding/runtime/tool versions; resource ownership/disposal |
| Failure/resources | Abort vs timeout, crash/overload/partial output/retry policy, cleanup and shutdown proof |
| Total cost and measured evidence | CPU across host/workers/children, aggregate RAM, end-to-end p50/p95/p99/throughput/event-loop delay; startup, copies/bytes, serialization, build/distribution/maintenance; samples or UNMEASURED |
| Permissions/provenance/deployment | Exact permissions, environment/cwd inheritance, binary source/hash, preparation scripts/node_modules, target OS/CPU/libc and actual execution |
| Decision and rollback | KEEP_TYPESCRIPT / NATIVE_JUSTIFIED / INCONCLUSIVE, reasons and unmet gates; rollback to baseline/known artifact, owner and trigger |

A faster kernel with worse tails, aggregate RAM, deployment or maintenance may warrant KEEP_TYPESCRIPT. Use INCONCLUSIVE when missing evidence prevents a decision; a measured regression may justify KEEP_TYPESCRIPT while unmet adoption gates remain explicit. No universal speedup CI gate. Capability reuse can be justified without claiming a speedup, but still requires compatibility, resource and deployment proof. Reference verification evidence once rather than copying its matrix.
