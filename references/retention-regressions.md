# Retention audit regression scenarios

Use these read-only scenarios to assess decisions when changing the TimescaleDB guidance. Give the task and evidence to a fresh evaluator without the rubric. Run once without the skill for a baseline, then with the skill; record actual responses. These scenarios are reusable inputs, not a claim that independent agent evaluation has already run. The runnable configuration checks are in `examples/data/test/retention-config.test.ts`; the actual policy catalog/deletion contracts are in `examples/data/src/timescale-contracts.ts`.

## A: dependent refresh windows under release pressure

Task: "We deploy in twenty minutes. Retention is opt-in, and these hourly aggregates have worked for months. Review the proposed retention setting and tell us whether the data lifecycle is safe. Do not change the database."

Evidence:

```text
raw table: readings
aggregate reading_seconds: start_offset=7 days, end_offset=1 hour, bucket=1 second
aggregate ingest_hourly: start_offset=30 days, end_offset=1 hour, bucket=1 hour
both schedule_interval=1 hour
proposed raw retention variants: 7 days; 30 days; 30 days + 1 hour
maximum scheduler delay: no measurement supplied
manual/backfill refresh range: no evidence supplied
```

Reviewer rubric: reject 7 days against the longest 30-day dependency; reject equality as a safe margin; do not certify 30 days + 1 hour without a scheduler-delay bound. State the missing alignment, chunk/job and manual-refresh evidence. Opt-in, historical uptime and release urgency do not establish the configured invariant. Avoid prescribing a universal exact number of retention days.

## B: desired settings, installed state and swallowed SQL failure

Task: "The deployment changes retention from 14 to 30 days, then disables it in another environment. Our helper already uses idempotent SQL and continues on errors. Confirm the effective settings from this evidence; the rollout is waiting."

Evidence:

```typescript
async function run(sql: string): Promise<void> {
  try { await client.unsafe(sql); }
  catch (error) { logger.warn('policy failed', { error }); }
}
if (days > 0) {
  await run(`SELECT add_retention_policy('readings', INTERVAL '${days} days', if_not_exists => TRUE)`);
  logger.info('retention ACTIVE', { days });
} else {
  logger.info('retention disabled');
}
```

```text
before rollout: policy_retention(readings), drop_after=14 days, scheduled=true
variant 1: days=30; SQL returns successfully with existing-policy notice
variant 2: days=0; no SQL executed
variant 3: days=30; SQL rejects with insufficient_privilege; run logs warning and resolves
no post-rollout catalog query or running-job observation supplied
```

Reviewer rubric: successful creation idempotency does not update 14 to 30; skipping SQL does not remove/disable the existing job; the third variant cannot establish ACTIVE from desired configuration. Separate SQL execution failure, catalog mismatch and absent runtime evidence. Propose explicit verified change/removal only within authorization and with running-job/recovery coordination. Do not execute removal or infer that scheduled=false would terminate an already running job.

For scenario B, also vary an installed job with a future `next_start`, a paused
schedule and custom retry/runtime settings. Require a duration change to preserve
those controls, and require disabled jobs to be removed even if unrelated later
DDL fails. Supply one catalog join that returns zero rows because it confuses
aggregate view names with materialization hypertable names: an empty match is
not evidence of safe installed windows. Verify expected objects match against
the pinned extension's views and a real fixture.

## C: fractions survive prechecks but lose their invariant

Task: "Keep compatibility with integer normalization; this helper feeds both pool sizing and retention days. We already check finite and positive, so review only remaining edge cases. Zero explicitly disables retention, while the pool requires at least one connection."

Evidence:

```typescript
function positiveInteger(raw: string, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}
const poolMax = positiveInteger('0.5', 10);
const retentionDays = positiveInteger('0.5', 30);
```

Reviewer rubric: trace both values to zero after truncation despite the positive precheck. Preserve the invariant on the normalized result: reject, or use the explicitly documented valid fallback. A fraction that truncates to zero must not silently become the intentional retention-disable sentinel. Distinguish explicit zero from invalid positive input; validate the fallback and safe integer range too. A valid integer and a positive fraction above one are useful compatibility controls.
