import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { fixturePool, transaction } from '../src/pg.ts';
import { postgresUrl, assertFixtureDatabase } from '../src/target.ts';

test('real PostgreSQL: integrity, same-client rollback, deterministic concurrency, RLS, migration and EXPLAIN', async () => {
  const pool = fixturePool(postgresUrl);
  try {
    await assertFixtureDatabase(async text => (await pool.query(text)).rows);
    await pool.query(await readFile(new URL('../sql/001-relational.sql', import.meta.url), 'utf8'));
    const inventory = await pool.query<{ server_version: string }>('SHOW server_version');
    assert.match(inventory.rows[0]?.server_version ?? '', /^17\.6/);
    console.log('PostgreSQL inventory', inventory.rows);
    await pool.query('INSERT INTO data_evidence.readings VALUES ($1,$2,$3)', ['a', 'one', 1]);
    for (const [values, code] of [
      [['a', 'one', 2], '23505'], [['missing', 'x', 1], '23503'],
      [['a', 'negative', -1], '23514'], [['a', 'null', null], '23502'],
    ] as const) {
      await assert.rejects(pool.query('INSERT INTO data_evidence.readings VALUES ($1,$2,$3)', [...values]), { code });
    }
    await assert.rejects(transaction(pool, async client => {
      const pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid;
      await client.query('INSERT INTO data_evidence.readings VALUES ($1,$2,$3)', ['a', 'rolled-back', 1]);
      assert.equal((await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid, pid);
      await client.query('INSERT INTO data_evidence.outbox VALUES ($1,$2,$3)', ['a', 'rolled-back', '']);
    }), { code: '23514' });
    assert.equal((await pool.query("SELECT id FROM data_evidence.readings WHERE id='rolled-back'")).rowCount, 0);
    await assert.rejects(transaction(pool, async client => {
      await client.query("SET LOCAL statement_timeout='20ms'");
      await client.query('SELECT pg_sleep(10)');
    }), {code:'57014'});
    assert.equal((await pool.query('SELECT 1 AS alive')).rows[0]?.alive,1);

    // Both transactions must have started before either update. Atomic SQL avoids a lost update.
    const left = await pool.connect();
    const right = await pool.connect();
    try {
      await Promise.all([left.query('BEGIN'), right.query('BEGIN')]);
      assert.notEqual((await left.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid, (await right.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid);
      await Promise.all([left.query('SELECT value FROM data_evidence.counters WHERE id=1'), right.query('SELECT value FROM data_evidence.counters WHERE id=1')]);
      await left.query('UPDATE data_evidence.counters SET value=value+1 WHERE id=1');
      const waiting = right.query('UPDATE data_evidence.counters SET value=value+1 WHERE id=1');
      await left.query('COMMIT');
      await waiting;
      await right.query('COMMIT');
    } finally { await Promise.all([left.query('ROLLBACK'), right.query('ROLLBACK')]); left.release(); right.release(); }
    assert.equal((await pool.query<{ value: number }>('SELECT value FROM data_evidence.counters')).rows[0]?.value, 2);

    const app = new Pool({ connectionString: 'postgres://guardrails_data_app:local_data_app_only@127.0.0.1:55432/guardrails_data', max: 1, statement_timeout: 3000 });
    try {
      let pid: number | undefined;
      await transaction(app, async client => {
        const role = (await client.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>('SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
        assert.equal(role?.current_user, 'guardrails_data_app'); assert.equal(role.rolsuper, false); assert.equal(role.rolbypassrls, false);
        pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid;
        await client.query("SELECT set_config('app.tenant_id', $1, true)", ['a']);
        assert.deepEqual((await client.query('SELECT body FROM data_evidence.documents ORDER BY id')).rows, [{ body: 'A' }]);
        assert.equal((await client.query("UPDATE data_evidence.documents SET body='own' WHERE tenant_id='a'")).rowCount, 1);
        assert.equal((await client.query("UPDATE data_evidence.documents SET body='stolen' WHERE tenant_id='b'")).rowCount, 0);
        await assert.rejects(client.query("INSERT INTO data_evidence.documents VALUES ('b','2','wrong')"), { code: '42501' });
        // Error aborts transaction; wrapper rolls back and clears LOCAL context.
        throw new Error('rollback RLS error');
      }).catch(error => assert.equal(error.message, 'rollback RLS error'));
      await transaction(app, async client => {
        assert.equal((await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid, pid);
        assert.equal((await client.query('SELECT * FROM data_evidence.documents')).rowCount, 0);
        await client.query("SELECT set_config('app.tenant_id', $1, true)", ['b']);
        assert.deepEqual((await client.query('SELECT body FROM data_evidence.documents')).rows, [{ body: 'B' }]);
        await assert.rejects(client.query('DROP TABLE data_evidence.documents'), { code: '42501' });
        throw new Error('rollback DDL error');
      }).catch(error => assert.equal(error.message, 'rollback DDL error'));
      await transaction(app, async client => {
        await client.query("SELECT set_config('app.tenant_id',$1,true)",['b']);
        await client.query('INSERT INTO data_evidence.documents VALUES ($1,$2,$3)',['b','2','own committed']);
      });
      assert.equal((await app.query('SELECT * FROM data_evidence.documents')).rowCount,0);
    } finally { await app.end(); }

    await pool.query(await readFile(new URL('../sql/002-expand.sql', import.meta.url), 'utf8'));
    await pool.query('INSERT INTO data_evidence.readings(tenant_id,id,value) VALUES ($1,$2,$3)', ['b','old-client',1]);
    assert.equal((await pool.query<{ unit: string }>("SELECT unit FROM data_evidence.readings WHERE id='old-client'")).rows[0]?.unit, 'count');
    await pool.query('CREATE INDEX readings_tenant_value ON data_evidence.readings(tenant_id,value,id)');
    await pool.query("INSERT INTO data_evidence.readings(tenant_id,id,value) SELECT 'a', 'bulk-'||s, s FROM generate_series(1,2000) s");
    await pool.query('ANALYZE data_evidence.readings');
    const plan = await pool.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id,value FROM data_evidence.readings WHERE tenant_id=$1 AND value>$2 ORDER BY value,id LIMIT 10', ['a',1900]);
    assert.ok(plan.rows[0]?.['QUERY PLAN']);
    console.log('Measured ephemeral fixture plan', JSON.stringify(plan.rows));
  } finally { await pool.end(); }
});
