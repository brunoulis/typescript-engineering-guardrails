import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(__dirname, '../..');
const npm = process.env['npm_execpath'];
if (!npm) throw Error('Run through npm run verify:data so the package manager is explicit');
const data = path.join(root, 'examples/data');
const backend = path.join(root, 'examples/postgres-backend');
const env = { ...process.env,
  BACKEND_MIGRATION_DATABASE_URL: 'postgres://guardrails:local_guardrails_only@127.0.0.1:55432/guardrails_backend',
  BACKEND_TEST_DATABASE_URL: 'postgres://guardrails_backend_app:local_backend_app_only@127.0.0.1:55432/guardrails_backend',
};
function run(executable: string, args: string[], cwd: string): void {
  console.log('Checking:', path.basename(executable), ...args, 'in', path.relative(root, cwd));
  const result = spawnSync(executable, args, { cwd, env, stdio: 'inherit', shell: false, windowsHide: true, timeout: 180000 });
  if (result.error || result.status !== 0) throw Error(result.error?.message ?? `Check failed: exit ${result.status}`);
}
const script = (cwd: string, name: string) => run(process.execPath, [npm, 'run', name], cwd);
// Deliberately sequential: the runtime contracts reset their shared dedicated schema.
script(data, 'db:up');
script(data, 'typecheck');
script(data, 'test');
const bun = process.env['BUN_EXECUTABLE'] ?? 'bun';
const deno = process.env['DENO_EXECUTABLE'] ?? 'deno';
run(bun, ['--version'], data);
run(bun, ['src/run-runtime.ts'], data);
run(deno, ['--version'], data);
run(deno, ['task', 'check'], data);
run(deno, ['task', 'test'], data);
script(data, 'test:deno-permissions');
script(backend, 'db:prepare');
script(backend, 'check');
// Fixtures remain running for investigation. Explicit cleanup: examples/data npm run db:down.
