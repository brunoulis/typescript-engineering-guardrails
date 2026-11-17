import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Ajv from 'ajv';

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-report-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  fs.writeFileSync(path.join(root, 'a.ts'), 'export const x: any = 1;');
  const run = (...args: string[]) => spawnSync(process.execPath, [path.resolve('scripts/ts-rails-audit.cjs'), '--root', root, ...args], { encoding: 'utf8' });
  return { root, run };
}
test('baseline remains known after line insertion and new findings fail only the explicit policy', t => {
  const { root, run } = fixture(t);
  const baseline = path.join(root, 'baseline.json');
  assert.equal(run('--write-baseline', baseline).status, 0);
  fs.writeFileSync(path.join(root, 'a.ts'), '\n// unrelated\nexport const x: any = 1;');
  const known = run('--baseline', baseline, '--fail-on-new', '--format', 'json');
  assert.equal(known.status, 0, known.stderr);
  assert.deepEqual(JSON.parse(known.stdout).baseline, { added: 0, known: 1, absent: 0, comparable: true });
  fs.appendFileSync(path.join(root, 'a.ts'), '\nexport const y: any = 2;');
  assert.equal(run('--baseline', baseline, '--fail-on-new').status, 2);
});
test('baseline refuses overwrite, source destinations and incompatible scopes', t => {
  const { root, run } = fixture(t);
  const baseline = path.join(root, 'baseline.json');
  assert.equal(run('--write-baseline', baseline).status, 0);
  assert.equal(run('--write-baseline', baseline).status, 1);
  assert.equal(run('--write-baseline', path.join(root, 'a.ts'), '--replace-baseline').status, 1);
  assert.equal(fs.readFileSync(path.join(root, 'a.ts'), 'utf8'), 'export const x: any = 1;');
  assert.equal(run('--baseline', baseline, '--exclude-tests').status, 1);
  assert.equal(run('--baseline', baseline, '--path', 'a.ts').status, 1);
});
test('baseline replacement never follows a dangling symlink or creates its target', t => {
  const { root, run } = fixture(t);
  const destination = path.join(root, 'baseline.json');
  const victim = path.join(root, 'victim.json');
  try { fs.symlinkSync(victim, destination, 'file'); }
  catch (error) {
    // Windows can require a privilege to create file symlinks; junction ancestors are tested separately.
    if ((error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('File symlink privilege unavailable'); return; }
    throw error;
  }
  assert.equal(run('--write-baseline', destination, '--replace-baseline').status, 1);
  assert.equal(fs.existsSync(victim), false);
  assert.equal(fs.lstatSync(destination).isSymbolicLink(), true);
});
test('live baseline symlinks and symlink ancestors cannot overwrite their targets', t => {
  const { root, run } = fixture(t);
  const live = path.join(root, 'live.json'), victim = path.join(root, 'victim.json');
  fs.writeFileSync(victim, 'keep');
  try { fs.symlinkSync(victim, live, 'file'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('File symlink privilege unavailable'); return; } throw error; }
  for (const flags of [[], ['--replace-baseline']]) {
    assert.equal(run('--write-baseline', live, ...flags).status, 1);
    assert.equal(fs.readFileSync(victim, 'utf8'), 'keep');
  }
  const real = path.join(root, 'real'), link = path.join(root, 'linked');
  fs.mkdirSync(real); fs.symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(run('--write-baseline', path.join(link, 'baseline.json')).status, 1);
  assert.equal(fs.existsSync(path.join(real, 'baseline.json')), false);
});
test('incomplete scans cannot write a baseline or claim absent findings fixed', t => {
  const { root, run } = fixture(t);
  const baseline = path.join(root, 'baseline.json');
  assert.equal(run('--write-baseline', baseline).status, 0);
  fs.writeFileSync(path.join(root, 'a.ts'), 'const x: = ;');
  const result = run('--baseline', baseline, '--format', 'json');
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).baseline.absent, 0);
  assert.equal(JSON.parse(result.stdout).baseline.comparable, false);
  const dest = path.join(root, 'new-baseline.json');
  assert.equal(run('--write-baseline', dest).status, 1);
  assert.equal(fs.existsSync(dest), false);
});
test('failed baseline operations preserve computed parser diagnostics in JSON and SARIF', t => {
  const { root, run } = fixture(t);
  fs.writeFileSync(path.join(root, 'a.ts'), 'const invalid: = ;');
  const destination = path.join(root, 'new-baseline.json');
  const json = run('--write-baseline', destination, '--format', 'json');
  assert.equal(json.status, 1);
  assert.notEqual(json.stdout, '', json.stderr);
  const report = JSON.parse(json.stdout);
  assert.ok(report.diagnostics.some((d: {code:string}) => d.code === 'SOURCE_PARSE_ERROR'));
  assert.ok(report.diagnostics.some((d: {code:string}) => d.code === 'BASELINE_ERROR'));
  assert.equal(fs.existsSync(destination), false);
  fs.writeFileSync(destination, '{}');
  const sarif = run('--baseline', destination, '--format', 'sarif');
  assert.equal(sarif.status, 1);
  const notifications = JSON.parse(sarif.stdout).runs[0].invocations[0].toolExecutionNotifications as {descriptor:{id:string}}[];
  assert.ok(notifications.some(n => n.descriptor.id === 'SOURCE_PARSE_ERROR'));
  assert.ok(notifications.some(n => n.descriptor.id === 'BASELINE_ERROR'));
});
test('JSON config is validated and CLI choices override it', t => {
  const { root, run } = fixture(t);
  const config = path.join(root, 'rails.json');
  fs.writeFileSync(config, '{"version":1,"rules":{"EXPLICIT_ANY":false}}');
  const ok = run('--config', config, '--format', 'json');
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).results.length, 0);
  fs.writeFileSync(config, '{"version":1,"typo":true}');
  assert.equal(run('--config', config).status, 1);
  fs.writeFileSync(config, '{"version":1,"mode":"typed"}');
  assert.equal(run('--config', config, '--mode', 'syntax').status, 0);
});
test('SARIF includes relative URI, heuristic rules and incomplete invocation', t => {
  const { root, run } = fixture(t);
  fs.writeFileSync(path.join(root, 'a.ts'), 'let x: any;\nconst broken: = ;');
  fs.writeFileSync(path.join(root, 'space #%.ts'), 'let y: any;');
  const result = run('--format', 'sarif');
  assert.equal(result.status, 1);
  const sarif = JSON.parse(result.stdout);
  const validate = new Ajv({ strict: false, validateFormats: false }).compile(JSON.parse(fs.readFileSync(path.resolve('tool/test/fixtures/sarif-2.1.0.schema.json'), 'utf8')));
  assert.equal(validate(sarif), true, JSON.stringify(validate.errors));
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs[0].invocations[0].executionSuccessful, false);
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, 'space%20%23%25.ts');
  assert.equal(sarif.runs[0].results[0].properties.confidence, 'HEURISTIC');
});
