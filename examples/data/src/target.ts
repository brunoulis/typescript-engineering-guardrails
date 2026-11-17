export const postgresUrl = 'postgres://guardrails:local_guardrails_only@127.0.0.1:55432/guardrails_data';
export const timescaleUrl = 'postgres://guardrails:local_guardrails_only@127.0.0.1:55433/guardrails_timescale';
export async function assertFixtureDatabase(query: (sql: string) => Promise<Record<string, unknown>[]>): Promise<void> {
  const rows = await query("SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname=current_database()");
  if (rows[0]?.['marker'] !== 'guardrails-dedicated-ephemeral-v2') throw new Error('Missing dedicated ephemeral database marker');
}

// No arbitrary connection URL is accepted by destructive fixtures, even via ENV.
export function assertDedicatedTarget(value: string): URL {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
    || url.username !== 'guardrails' || url.password !== 'local_guardrails_only'
    || !((url.port === '55432' && url.pathname === '/guardrails_data')
      || (url.port === '55433' && url.pathname === '/guardrails_timescale')) || url.search !== '') {
    throw new Error('Refusing database outside dedicated loopback guardrails fixtures');
  }
  return url;
}
