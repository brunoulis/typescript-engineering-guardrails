import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const fixtures = [
  { name: 'guardrails-v2-postgres', image: 'postgres@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94', port: '55432', db: 'guardrails_data' },
  { name: 'guardrails-v2-timescale', image: 'timescale/timescaledb@sha256:fba60021a224479e174ae1ec577c1a0576d5185b09fe9e622f1d19e4bf5bab0d', port: '55433', db: 'guardrails_timescale' },
] as const;
function docker(...args: string[]): string { return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], timeout: 120000 }).trim(); }
const action = process.argv[2];
if (action !== 'up' && action !== 'down') throw new Error('Usage: provision.ts up|down');
for (const fixture of fixtures) {
  const names = docker('ps','-a','--format','{{.Names}}').split(/\r?\n/);
  const exists = names.includes(fixture.name);
  if (exists && docker('inspect','--format','{{index .Config.Labels "org.guardrails.fixture"}}',fixture.name) !== 'data-v2') {
    throw new Error(`Refusing container with unexpected ownership: ${fixture.name}`);
  }
  if (exists && docker('inspect','--format','{{.Config.Image}}',fixture.name) !== fixture.image) throw new Error(`Fixture image differs from pinned digest: ${fixture.name}`);
  if (action === 'down') {
    if (exists) docker('rm','--force',fixture.name);
    continue;
  }
  if (!exists) docker('run','--detach','--name',fixture.name,'--label','org.guardrails.fixture=data-v2',
    '--publish',`127.0.0.1:${fixture.port}:5432`,'--env','POSTGRES_USER=guardrails',
    '--env','POSTGRES_PASSWORD=local_guardrails_only','--env',`POSTGRES_DB=${fixture.db}`,
    '--tmpfs','/var/lib/postgresql/data',fixture.image);
  else docker('start',fixture.name);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    // The entrypoint's temporary init server accepts Unix sockets but has
    // listen_addresses=''. TCP readiness waits for the final server instead.
    try { docker('exec',fixture.name,'pg_isready','-h','127.0.0.1','-U','guardrails','-d',fixture.db); ready = true; break; }
    catch { await setTimeout(500); }
  }
  if (!ready) throw new Error(`Database did not become ready: ${fixture.name}`);
  docker('exec',fixture.name,'psql','-U','guardrails','-d',fixture.db,'-v','ON_ERROR_STOP=1','-c',`COMMENT ON DATABASE ${fixture.db} IS 'guardrails-dedicated-ephemeral-v2'`);
  console.log(fixture.name, fixture.image, docker('exec',fixture.name,'psql','-U','guardrails','-d',fixture.db,'-Atc',"SELECT version(); SELECT extversion FROM pg_extension WHERE extname='timescaledb'"));
}
