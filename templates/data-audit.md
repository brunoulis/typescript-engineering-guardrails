# Data audit evidence

Project / operation / reviewed revision:
Runtime and exact driver / ORM versions (installed metadata + lockfile):
PostgreSQL server / TimescaleDB extension / image digest / hosting:
Scope inspected, skipped paths, missing catalog/workload evidence:
Application LOGIN / migration owner / connection budgets:

| Invariant or question | Evidence and effective role | Result / uncertainty | Smallest action and regression |
| --- | --- | --- | --- |
| PK, NOT NULL, UNIQUE, FK, CHECK reflect business and tenant invariants | Negative actual-server statements | | |
| Bound values; allowlisted identifiers; bounded ranges/batches; stable pagination | Driver calls and boundary tests | | |
| No N+1 for representative cardinalities | Recorded real query count and response parity | | |
| One client/scoped transaction; real partial failure rollback | Backend PID / reserved object / failure after first mutation | | |
| Concurrent invariant and bounded retry/idempotency | Distinct connections, deterministic barrier, final durable state | | |
| Least privilege, effective owner/superuser/BYPASSRLS | current_user / grants / denied DDL | | |
| RLS USING and WITH CHECK, if adopted | Own/foreign/no-context reads and writes | | |
| Tenant context cleared after commit and rollback | Same physical connection reused by second actor/no context | | |
| Query cancellation and pool lifecycle | Real server timeout/cancel, recovery and close | | |
| Pool/acquisition/statement/lock/idle-transaction budgets | All replicas/processes and server budget | | |
| Indexes justified by real queries/data | EXPLAIN ANALYZE BUFFERS in dedicated fixture; write cost | | |
| Expand/contract and bounded backfill | Populated old schema, old/new clients, lock budget, forward recovery | | |
| All hypertable partition columns in UNIQUE/PK | Valid/rejected real DDL, additional dimensions included | | |
| Bucket alignment/timezone/gaps/partial windows | DST, empty bucket and [start,end) examples | | |
| Recent + late aggregate correctness | Watermark/materialized_only, stale history then refresh | | |
| Columnstore versioned API and fidelity | Before/after sorted rows; supported DML after conversion | | |
| Retention/refetch compatibility | Every dependent aggregate's lookback; raw retention exceeds longest lookback + bucket/alignment + scheduler-delay budget; preserved summaries AND deleted-window-refresh loss counterexample; manual/backfill refresh limits | | |
| Policy configuration and operational lateness | Catalog/jobs, windows, chunks, late-arrival budget | | |
| Desired versus installed policy lifecycle | Existing duration survives if_not_exists; explicit change/disable reconciliation; paused/running job state and recovery | | |
| Policy input validation and truthful outcomes | Validate normalized retention/pool integers (0.5 must not become zero); distinguish explicit disable from invalid input; rejected SQL and catalog mismatch cannot report applied/ACTIVE; requested/applied/skipped/failed evidence | | |
| Aggregate security isolation | Effective restricted role; raw/direct aggregate denial; combination support | | |
| Runtime support claimed matches execution | Exact Node/Bun/Deno commands, permissions, failures and close | | |

Findings: severity + confidence; file/SQL/catalog evidence; impact; smallest fix; verification; disposition. Heuristic AST leads are not confirmed vulnerabilities.

Performance before/after or NOT MEASURED:
Checks executed and exact outcomes:
Checks pending / limitations / unsupported combinations:
Recovery / irreversible effects / rollback procedure:
Independent review and remaining risks:
