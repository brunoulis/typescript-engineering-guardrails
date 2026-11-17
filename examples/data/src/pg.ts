import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { assertDedicatedTarget } from './target.ts';

export function fixturePool(url: string, max = 4): Pool {
  assertDedicatedTarget(url);
  return new Pool({ connectionString: url, max, connectionTimeoutMillis: 3000, options: '-c timezone=UTC',
    statement_timeout: 5000, lock_timeout: 2000, idle_in_transaction_session_timeout: 5000 });
}

export async function transaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
