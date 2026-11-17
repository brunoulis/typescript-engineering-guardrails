import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { postgresUrl, timescaleUrl, assertDedicatedTarget, assertFixtureDatabase } from './target.ts';
import { verifyTimescale } from './timescale-contracts.ts';

export async function runtimeContracts(): Promise<void> {
  for (const url of [postgresUrl, timescaleUrl]) {
    assertDedicatedTarget(url);
    const sql = postgres(url, { max: 2, connect_timeout: 3, idle_timeout: 2,
      ssl: false, max_lifetime: 60, backoff: () => 0.05,
      keep_alive: 60, prepare: true, debug: false, fetch_types: true,
      publications: 'alltables', target_session_attrs: 'read-write',
      connection: { timezone: 'UTC', statement_timeout: 5000, lock_timeout: 2000, idle_in_transaction_session_timeout: 5000 }, onnotice: () => {} });
    try {
      await assertFixtureDatabase(async text => [...await sql.unsafe(text)]);
      await sql`DROP TABLE IF EXISTS public.runtime_batch`;
      await sql`CREATE TABLE public.runtime_batch(id text PRIMARY KEY, value integer NOT NULL CHECK(value>=0))`;
      const input = "Robert'); DROP TABLE public.runtime_batch;--";
      await sql.begin(async tx => {
        // Bounded atomic batch on the scoped reserved transaction connection.
        for (const [id, value] of [[input,1],['second',2]] as const) {
          await tx`INSERT INTO public.runtime_batch VALUES (${id},${value})`;
        }
      });
      assert.equal((await sql`SELECT value FROM public.runtime_batch WHERE id=${input} LIMIT ${1}`)[0]?.['value'],1);
      await assert.rejects(sql.begin(async tx => {
        await tx`INSERT INTO public.runtime_batch VALUES (${'rollback'},${3})`;
        await tx`INSERT INTO public.runtime_batch VALUES (${'invalid'},${-1})`;
      }), {code:'23514'});
      assert.equal((await sql`SELECT count(*)::int AS n FROM public.runtime_batch`)[0]?.['n'],2);
      await assert.rejects(sql`INSERT INTO public.runtime_batch VALUES (${'second'},${4})`,{code:'23505'});
      await assert.rejects(sql.begin(async tx => {
        await tx`SET LOCAL statement_timeout='20ms'`;
        await tx`SELECT pg_sleep(10)`;
      }), {code:'57014'});
      assert.equal((await sql`SELECT 1 AS alive`)[0]?.['alive'],1);
      if (url === timescaleUrl) {
        // Trusted fixture DDL is the only unparameterized multi-statement input.
        await sql.unsafe(await readFile(new URL('../sql/010-timescale.sql', import.meta.url),'utf8'));
        await verifyTimescale(async (text, parameters=[]) => [...await sql.unsafe(text,[...parameters])]);
      }
      await sql`DROP TABLE public.runtime_batch`;
    } finally { await sql.end({ timeout: 3 }); }
  }
  console.log('postgres.js real PostgreSQL + TimescaleDB reference contracts passed', {
    nodeCompatibility:process.versions.node, bun:process.versions['bun'], deno:process.versions['deno'],
  });
}
