import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { fixturePool } from '../src/pg.ts';
import { timescaleUrl, assertFixtureDatabase } from '../src/target.ts';
import { verifyTimescale } from '../src/timescale-contracts.ts';

test('real TimescaleDB contracts and Drizzle parameterized hypertable/aggregate integration', async () => {
  const pool = fixturePool(timescaleUrl);
  try {
    await assertFixtureDatabase(async text => (await pool.query(text)).rows);
    await pool.query(await readFile(new URL('../sql/010-timescale.sql', import.meta.url), 'utf8'));
    await verifyTimescale(async (text, parameters = []) => (await pool.query(text, [...parameters])).rows);
    const db = drizzle(pool);
    const tenant = 'drizzle-tenant';
    await db.transaction(async tx => {
      await tx.execute(sql`INSERT INTO ts_evidence.metrics(tenant_id,device,at,value) VALUES (${tenant}, ${'drizzle'}, ${'2025-02-01T00:00Z'}::timestamptz, ${7})`);
    });
    assert.equal((await db.execute(sql`SELECT value FROM ts_evidence.metrics WHERE tenant_id=${tenant} AND at >= ${'2025-02-01'}::timestamptz AND at < ${'2025-02-02'}::timestamptz LIMIT ${10}`)).rows.length, 1);
    await db.execute(sql`CALL refresh_continuous_aggregate('ts_evidence.hourly', ${'2025-02-01'}::timestamptz, ${'2025-02-02'}::timestamptz)`);
    assert.equal((await db.execute(sql`SELECT total FROM ts_evidence.hourly WHERE tenant_id=${tenant} LIMIT ${10}`)).rows[0]?.['total'], 7);
    await db.execute(sql`INSERT INTO ts_evidence.metrics VALUES ('a','secure','2025-02-02',1),('b','secure','2025-02-02',99)`);
    await db.execute(sql`CALL refresh_continuous_aggregate('ts_evidence.hourly','2025-02-02'::timestamptz,'2025-02-03'::timestamptz)`);
    const app = new Pool({ connectionString: 'postgres://guardrails_metrics_a:local_metrics_a_only@127.0.0.1:55433/guardrails_timescale', max: 1, connectionTimeoutMillis: 3000, statement_timeout: 3000 });
    try {
      const role = (await app.query('SELECT current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
      assert.equal(role.current_user,'guardrails_metrics_a'); assert.equal(role.rolsuper,false); assert.equal(role.rolbypassrls,false);
      assert.deepEqual((await app.query("SELECT tenant_id,total FROM ts_evidence.tenant_a_hourly WHERE bucket >= $1::timestamptz AND bucket < $2::timestamptz ORDER BY bucket LIMIT 10",['2025-02-02','2025-02-03'])).rows, [{tenant_id:'a',total:1}]);
      await assert.rejects(app.query('SELECT * FROM ts_evidence.hourly'), {code:'42501'});
      await assert.rejects(app.query('SELECT * FROM ts_evidence.metrics'), {code:'42501'});
    } finally { await app.end(); }
  } finally { await pool.end(); }
});
