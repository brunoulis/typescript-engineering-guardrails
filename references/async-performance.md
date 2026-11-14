# Async correctness, performance and reliability

- Map operations to I/O-bound vs CPU-bound. An `async` function may still block the event loop doing large CPU parsing, encryption, data reduction or synchronous loops.
- Require cancellation/timeout budgets for remote calls where lifecycle matters. Propagate `AbortSignal` when supported; timeout alone might not abort downstream work.
- Retry only transient failures, with max attempts, total time budget, jitter/backoff, idempotency check and circuit/open failure behavior when needed. No automatic retry for business validation or non-idempotent writes.
- Bound queues, concurrency (`Promise.all` of arbitrary user-sized arrays is review signal), memory buffers and stream consumption. Explicitly decide overload rejection/drop/defer policies.
- Track pool ownership, connection lifecycle, shutdown, in-flight requests, tasks, unhandled errors, worker crash/restart and trace context propagation.
- Observe request p50/p95/p99, RPS, heap/RSS, GC, event-loop delay, DB execution time, queue depth, cold starts; use controlled representative measurements, not speculative claims.
- Caches need expiry, invalidation/consistency, memory limits, key scoping and security considerations. Don't add cache before verifying bottleneck.
