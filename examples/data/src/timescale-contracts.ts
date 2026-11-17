import assert from 'node:assert/strict';
import type { Query } from './types/query.ts';
import { verifyPolicyChange } from './retention-config.ts';

// Fixed SQL only; implementations bind values. This adapter shares real DB contracts, not driver behavior.
export async function verifyTimescale(query: Query): Promise<void> {
  const inventory = await query("SELECT current_setting('server_version') AS pg, extversion AS timescale FROM pg_extension WHERE extname='timescaledb'");
  assert.match(String(inventory[0]?.['pg']), /^17\.6/);
  assert.equal(inventory[0]?.['timescale'], '2.22.1');
  console.log('Timescale inventory', inventory);
  await query('CREATE TABLE ts_evidence.bad_key (id text PRIMARY KEY, at timestamptz NOT NULL)');
  await assert.rejects(query("SELECT create_hypertable('ts_evidence.bad_key', by_range('at'))"), { code: 'TS103' });
  await query('CREATE TABLE ts_evidence.bad_space_key (id text NOT NULL, at timestamptz NOT NULL, tenant_id text NOT NULL, PRIMARY KEY(id,at))');
  await query("SELECT create_hypertable('ts_evidence.bad_space_key', by_range('at'))");
  await assert.rejects(query("SELECT add_dimension('ts_evidence.bad_space_key', by_hash('tenant_id',2))"), { code: 'TS103' });
  await query('INSERT INTO ts_evidence.metrics VALUES ($1,$2,$3,$4)', ['a','sensor','2025-01-01T00:10Z',10]);
  await query('INSERT INTO ts_evidence.metrics VALUES ($1,$2,$3,$4)', ['a','sensor','2025-01-01T02:10Z',20]);
  await assert.rejects(query('INSERT INTO ts_evidence.metrics VALUES ($1,$2,$3,$4)', ['a','sensor','2025-01-01T00:10Z',10]), { code: '23505' });
  await assert.rejects(query('INSERT INTO ts_evidence.metrics VALUES ($1,$2,$3,$4)', ['a','sensor','2025-01-01T03:10Z',-1]), { code: '23514' });
  // Empty hour is absent, not zero. Ranges use [start,end); no partial-bucket assumption.
  const buckets = await query("SELECT time_bucket('1 hour', at) AS bucket, sum(value) AS total FROM ts_evidence.metrics WHERE at >= $1::timestamptz AND at < $2::timestamptz GROUP BY bucket ORDER BY bucket", ['2025-01-01','2025-01-02']);
  assert.deepEqual(buckets.map(row => row['total']), [10,20]);
  const dst = await query("SELECT extract(epoch FROM (time_bucket('1 day', '2025-03-31 12:00Z'::timestamptz, 'Europe/Madrid') - time_bucket('1 day', '2025-03-30 12:00Z'::timestamptz, 'Europe/Madrid')))/3600 AS hours");
  assert.equal(Number(dst[0]?.['hours']), 23);
  const fall = await query("SELECT extract(epoch FROM (time_bucket('1 day', '2025-10-27 12:00Z'::timestamptz, 'Europe/Madrid') - time_bucket('1 day', '2025-10-26 12:00Z'::timestamptz, 'Europe/Madrid')))/3600 AS hours");
  assert.equal(Number(fall[0]?.['hours']), 25);
  await query("CALL refresh_continuous_aggregate('ts_evidence.hourly', '2025-01-01'::timestamptz, '2025-01-02'::timestamptz)");
  assert.equal((await query('SELECT count(*)::int AS n FROM ts_evidence.hourly'))[0]?.['n'], 2);
  await query('INSERT INTO ts_evidence.metrics VALUES ($1,$2,$3,$4)', ['a','sensor','2025-01-02T00:10Z',30]);
  assert.equal((await query("SELECT count(*)::int AS n FROM ts_evidence.hourly WHERE bucket >= '2025-01-02'"))[0]?.['n'], 0);
  await query('ALTER MATERIALIZED VIEW ts_evidence.hourly SET (timescaledb.materialized_only=false)');
  assert.equal(Number((await query("SELECT total FROM ts_evidence.hourly WHERE bucket='2025-01-02'"))[0]?.['total']), 30);
  // Late data in materialized history is not repaired by enabling the real-time tail.
  await query('INSERT INTO ts_evidence.metrics VALUES ($1,$2,$3,$4)', ['a','late','2025-01-01T00:20Z',5]);
  assert.equal(Number((await query("SELECT total FROM ts_evidence.hourly WHERE bucket='2025-01-01'"))[0]?.['total']), 10);
  await query("CALL refresh_continuous_aggregate('ts_evidence.hourly','2025-01-01'::timestamptz,'2025-01-03'::timestamptz)");
  assert.equal(Number((await query("SELECT total FROM ts_evidence.hourly WHERE bucket='2025-01-01'"))[0]?.['total']), 15);
  await query('ALTER MATERIALIZED VIEW ts_evidence.hourly SET (timescaledb.materialized_only=true)');

  const before = await query('SELECT tenant_id,device,at::text,value FROM ts_evidence.metrics ORDER BY tenant_id,device,at');
  const chunks = await query("SELECT show_chunks('ts_evidence.metrics', older_than=>'2025-01-02'::timestamptz)::text AS chunk");
  assert.ok(chunks.length > 0);
  for (const row of chunks) await query('CALL convert_to_columnstore($1::regclass)', [String(row['chunk'])]);
  assert.ok(Number((await query("SELECT count(*)::int AS n FROM timescaledb_information.chunks WHERE hypertable_schema='ts_evidence' AND hypertable_name='metrics' AND is_compressed"))[0]?.['n']) > 0);
  assert.deepEqual(await query('SELECT tenant_id,device,at::text,value FROM ts_evidence.metrics ORDER BY tenant_id,device,at'), before);
  await query('INSERT INTO ts_evidence.metrics VALUES ($1,$2,$3,$4)', ['a','after-columnstore','2025-01-01T04:00Z',4]);
  await query('UPDATE ts_evidence.metrics SET value=$1 WHERE tenant_id=$2 AND device=$3 AND at=$4', [6,'a','after-columnstore','2025-01-01T04:00Z']);
  assert.equal(Number((await query("SELECT value FROM ts_evidence.metrics WHERE device='after-columnstore'"))[0]?.['value']), 6);
  // Materialize before raw deletion; safe subsequent refresh excludes deleted history.
  await query("CALL refresh_continuous_aggregate('ts_evidence.hourly','2025-01-01'::timestamptz,'2025-01-03'::timestamptz)");
  const preserved = await query("SELECT bucket::text,total FROM ts_evidence.hourly WHERE bucket<'2025-01-02' ORDER BY bucket");
  assert.ok(preserved.length > 0);
  const dropped = await query("SELECT drop_chunks('ts_evidence.metrics', older_than=>'2025-01-02'::timestamptz)");
  assert.ok(dropped.length > 0);
  assert.equal((await query("SELECT count(*)::int AS n FROM ts_evidence.metrics WHERE at<'2025-01-02'"))[0]?.['n'], 0);
  await query("CALL refresh_continuous_aggregate('ts_evidence.hourly','2025-01-02'::timestamptz,'2025-01-03'::timestamptz)");
  assert.deepEqual(await query("SELECT bucket::text,total FROM ts_evidence.hourly WHERE bucket<'2025-01-02' ORDER BY bucket"), preserved);
  // Deliberately dangerous counterexample: forcing a refetch of deleted raw windows removes summaries.
  await query("CALL refresh_continuous_aggregate('ts_evidence.hourly','2025-01-01'::timestamptz,'2025-01-02'::timestamptz, force=>true)");
  assert.equal((await query("SELECT count(*)::int AS n FROM ts_evidence.hourly WHERE bucket<'2025-01-02'"))[0]?.['n'], 0);
  const retention = await query("SELECT add_retention_policy('ts_evidence.metrics', INTERVAL '30 days', initial_start=>'2099-01-01'::timestamptz) AS id");
  const refresh = await query("SELECT add_continuous_aggregate_policy('ts_evidence.hourly', start_offset=>INTERVAL '7 days', end_offset=>INTERVAL '1 hour', schedule_interval=>INTERVAL '1 hour', initial_start=>'2099-01-01'::timestamptz) AS id");
  const policies = await query('SELECT job_id, config FROM timescaledb_information.jobs WHERE job_id=$1 OR job_id=$2 ORDER BY job_id', [Number(retention[0]?.['id']),Number(refresh[0]?.['id'])]);
  assert.equal(policies.length, 2);
  assert.ok(JSON.stringify(policies).includes('30 days'));
  assert.ok(JSON.stringify(policies).includes('7 days'));
  // Disable scheduler: fixed-date assertions above never depend on job scheduling or wall clock.
  await query('SELECT alter_job($1, scheduled=>false)', [Number(retention[0]?.['id'])]);
  await query('SELECT alter_job($1, scheduled=>false)', [Number(refresh[0]?.['id'])]);
  // A rejected statement is not applied even if an old installed policy still looks healthy.
  const rejectedChange = await verifyPolicyChange(
    async () => { await query("SELECT add_retention_policy('ts_evidence.missing_metrics', INTERVAL '45 days')"); },
    async () => (await query("SELECT config->>'drop_after' AS duration FROM timescaledb_information.jobs WHERE hypertable_schema='ts_evidence' AND hypertable_name='metrics' AND proc_name='policy_retention'"))[0]?.['duration'] === '30 days',
  );
  assert.equal(rejectedChange.status, 'failed');
  if (rejectedChange.status === 'failed') {
    assert.ok(rejectedChange.error && typeof rejectedChange.error === 'object' && 'code' in rejectedChange.error);
    assert.equal(rejectedChange.error.code, '42P01');
  }
  // Creation idempotency does not reconcile changed desired state.
  const unchangedChange = await verifyPolicyChange(
    async () => { await query("SELECT add_retention_policy('ts_evidence.metrics', INTERVAL '45 days', if_not_exists=>true)"); },
    async () => (await query("SELECT config->>'drop_after' AS duration FROM timescaledb_information.jobs WHERE hypertable_schema='ts_evidence' AND hypertable_name='metrics' AND proc_name='policy_retention'"))[0]?.['duration'] === '45 days',
  );
  assert.equal(unchangedChange.status, 'failed');
  const unchanged = await query("SELECT config->>'drop_after' AS duration, scheduled FROM timescaledb_information.jobs WHERE hypertable_schema='ts_evidence' AND hypertable_name='metrics' AND proc_name='policy_retention'");
  assert.deepEqual(unchanged, [{ duration: '30 days', scheduled: false }]);
  // Explicit fixture-only reconciliation; prevent execution before disabling the replacement.
  await query("SELECT remove_retention_policy('ts_evidence.metrics', if_exists=>true)");
  const replacement = await query("SELECT add_retention_policy('ts_evidence.metrics', INTERVAL '45 days', initial_start=>'2099-01-01'::timestamptz) AS id");
  await query('SELECT alter_job($1, scheduled=>false)', [Number(replacement[0]?.['id'])]);
  assert.deepEqual(await query("SELECT config->>'drop_after' AS duration, scheduled FROM timescaledb_information.jobs WHERE hypertable_schema='ts_evidence' AND hypertable_name='metrics' AND proc_name='policy_retention'"), [{ duration: '45 days', scheduled: false }]);
  const desiredRetentionEnabled = false;
  console.log('Desired retention enabled:', desiredRetentionEnabled);
  // A disabled setting/log alone leaves the installed policy, even with scheduling paused.
  assert.deepEqual(await query("SELECT config->>'drop_after' AS duration, scheduled FROM timescaledb_information.jobs WHERE hypertable_schema='ts_evidence' AND hypertable_name='metrics' AND proc_name='policy_retention'"), [{ duration: '45 days', scheduled: false }]);
  if (!desiredRetentionEnabled) await query("SELECT remove_retention_policy('ts_evidence.metrics', if_exists=>true)");
  assert.equal((await query("SELECT count(*)::int AS n FROM timescaledb_information.jobs WHERE hypertable_schema='ts_evidence' AND hypertable_name='metrics' AND proc_name='policy_retention'"))[0]?.['n'], 0);
  console.log('Verified retention preservation, deleted-window refresh loss and policy reconciliation; initial policies', policies);
}
