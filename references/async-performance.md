# Async correctness, performance and reliability

- Map operations to I/O-bound vs CPU-bound. An `async` function may still block the event loop doing large CPU parsing, encryption, data reduction or synchronous loops.
- Require cancellation/timeout budgets for remote calls where lifecycle matters. Propagate `AbortSignal` when supported; timeout alone might not abort downstream work.
- Retry only transient failures, with max attempts, total time budget, jitter/backoff, idempotency check and circuit/open failure behavior when needed. No automatic retry for business validation or non-idempotent writes.
- Bound queues, concurrency (`Promise.all` of arbitrary user-sized arrays is review signal), memory buffers and stream consumption. Explicitly decide overload rejection/drop/defer policies.
- Track pool ownership, connection lifecycle, shutdown, in-flight requests, tasks, unhandled errors, worker crash/restart and trace context propagation.
- Observe request p50/p95/p99, RPS, heap/RSS, GC, event-loop delay, DB execution time, queue depth, cold starts; use controlled representative measurements, not speculative claims.
- Caches need expiry, invalidation/consistency, memory limits, key scoping and security considerations. Don't add cache before verifying bottleneck.

## Operational evidence

Review logging per request/event, activation mode and reachable frequency, destination/sink, formatting/serialization, synchronous writes and sink backpressure. Record how volume is bounded, sampled, throttled or disabled, and whether secrets/PII are redacted before leaving the process. A log in a loop is a lead: rare, diagnostic-only or bounded logging can be legitimate. Investigate representative volume, cost and latency before asserting event-loop harm or prescribing a universal log limit.

Establish whether suspected CPU/blocking work actually runs on the request loop, an existing worker or a child process; `async`, an AST loop or a conversion alone proves neither blocking nor a need for native code. Capture queue saturation, stream pause/drain behavior, cancellation and shutdown under the relevant workload. Give each new retry/cache/timer resource an owner, invalidation/reset and closure path; a timeout without downstream termination does not prove reclaimed capacity.

For a measured CPU bottleneck, existing native dependency or explicit interoperability request, use [native interoperability](native-interoperability.md). Compare algorithm/data layout and a TypeScript worker before native integration. This file remains the source for general cancellation, backpressure and measurements. Native comparisons add host plus child/worker total CPU and aggregate RAM, startup/copies/serialization and end-to-end tails; a microbenchmark or `deno bench` alone does not establish request p95/p99 or a total-system improvement.
