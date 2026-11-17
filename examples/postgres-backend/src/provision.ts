import { execFileSync } from 'node:child_process';

// This bootstrap accepts no URL, SQL path or container override. The data package owns lifecycle.
const container = 'guardrails-v2-postgres';
const image = 'postgres@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94';
function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000 }).trim();
}
function psql(database: string, source: string): string {
  return docker('exec', container, 'psql', '-U', 'guardrails', '-d', database, '-v', 'ON_ERROR_STOP=1', '-Atc', source);
}

if (docker('inspect', '--format', '{{index .Config.Labels "org.guardrails.fixture"}}', container) !== 'data-v2'
  || docker('inspect', '--format', '{{.Config.Image}}', container) !== image) {
  throw new Error('Refusing unexpected container; start the pinned examples/data fixture first');
}
if (psql('postgres', "SELECT count(*) FROM pg_roles WHERE rolname='guardrails_backend_app'") === '0') {
  psql('postgres', "CREATE ROLE guardrails_backend_app LOGIN PASSWORD 'local_backend_app_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
}
if (psql('postgres', "SELECT rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname='guardrails_backend_app'") !== 'f') {
  throw new Error('Existing backend application role has unexpected elevated privileges');
}
if (psql('postgres', "SELECT count(*) FROM pg_database WHERE datname='guardrails_backend'") === '0') {
  psql('postgres', 'CREATE DATABASE guardrails_backend OWNER guardrails');
}
psql('postgres', "COMMENT ON DATABASE guardrails_backend IS 'guardrails-dedicated-ephemeral-backend-v2'; REVOKE ALL ON DATABASE guardrails_backend FROM PUBLIC; GRANT CONNECT ON DATABASE guardrails_backend TO guardrails_backend_app");
psql('guardrails_backend', 'REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO guardrails_backend_app');
console.log('Prepared dedicated guardrails_backend database and restricted application role');
