import type { TestContext } from 'node:test';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { audit, getTS } from '../src/index.js';
import { validateOptions } from '../src/core/config.js';
import { main } from '../src/cli.js';

const deno = spawnSync('deno', ['--version'], { encoding: 'utf8' }).status === 0;
const skip = deno ? false : 'deno executable not available';

function fixture(t: TestContext, files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-deno-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}
const app = {
  'deno.json': '{"tasks":{"start":"deno run src/main.ts"}}',
  'src/main.ts': 'import { used } from "./used.ts";\nexport const total: number = used + 1;\n',
  'src/used.ts': 'export const used: number = 1;\n',
  'src/dead.ts': 'export const dead: number = "no";\n',
  'test/a_test.ts': 'import { used } from "../src/used.ts";\nDeno.test("a", () => { if (used !== 1) throw Error("x"); });\n',
};
const listing = (root: string): string[] => fs.readdirSync(root).sort();

test('integration names are validated by config and CLI', () => {
  assert.deepEqual(validateOptions({ integrations: ['deno-check', 'deno-audit'] }).integrations, ['deno-check', 'deno-audit']);
  assert.throws(() => validateOptions({ integrations: ['deno-nope'] }), /Invalid integrations/);
  assert.equal(main(['--root', os.tmpdir(), '--integration', 'deno-nope']), 1);
});

test('deno-check reports type errors without writing to the audited tree', { skip }, (t: TestContext) => {
  const root = fixture(t, app);
  const before = listing(root);
  const report = audit(root, getTS(), { integrations: ['deno-check'] });
  assert.equal(report.status, 'COMPLETE', JSON.stringify(report.diagnostics));
  const errors = report.results.filter(f => f.code === 'DENO_TYPE_ERROR');
  assert.equal(errors.length, 1, JSON.stringify(report.results));
  assert.equal(errors[0]?.file, 'src/dead.ts');
  assert.equal(errors[0]?.line, 1);
  assert.match(errors[0]?.detail ?? '', /^TS2322/);
  assert.equal(report.integrations?.[0]?.status, 'COMPLETE');
  assert.deepEqual(listing(root), before);
});

test('deno-lint adds findings the auditor lacks and does not repeat any', { skip }, (t: TestContext) => {
  const root = fixture(t, { 'deno.json': '{}', 'src/main.ts': 'const a: any = 1;\nfunction unusedFunction() {}\nexport const b = a;\n' });
  const report = audit(root, getTS(), { integrations: ['deno-lint'] });
  assert.equal(report.status, 'COMPLETE', JSON.stringify(report.diagnostics));
  assert.ok(report.results.some(f => f.code === 'DENO_LINT' && f.detail.startsWith('no-unused-vars') && f.line === 2), JSON.stringify(report.results));
  assert.ok(report.results.some(f => f.code === 'EXPLICIT_ANY'));
  assert.ok(!report.results.some(f => f.code === 'DENO_LINT' && f.detail.startsWith('no-explicit-any')));
});

test('deno-graph flags files no entrypoint imports and keeps tests and task entries', { skip }, (t: TestContext) => {
  const root = fixture(t, app);
  const report = audit(root, getTS(), { integrations: ['deno-graph'] });
  assert.equal(report.status, 'COMPLETE', JSON.stringify(report.diagnostics));
  assert.deepEqual(report.results.filter(f => f.code === 'DENO_UNREACHABLE_FILE').map(f => f.file), ['src/dead.ts']);
});

test('deno-graph without any detectable entrypoint is INCOMPLETE, never clean', { skip }, (t: TestContext) => {
  const root = fixture(t, { 'deno.json': '{}', 'src/lib.ts': 'export const a = 1;\n' });
  const report = audit(root, getTS(), { integrations: ['deno-graph'] });
  assert.equal(report.status, 'INCOMPLETE');
  assert.ok(report.diagnostics.some(d => d.code === 'EXTERNAL_TOOL_ERROR' && /entrypoints/.test(d.message)));
  assert.equal(report.integrations?.[0]?.status, 'INCOMPLETE');
  assert.equal(report.results.some(f => f.code === 'DENO_UNREACHABLE_FILE'), false);
});

test('Deno integrations need a Deno config', { skip }, (t: TestContext) => {
  const root = fixture(t, { 'src/main.ts': 'export const a = 1;\n' });
  const report = audit(root, getTS(), { integrations: ['deno-check'] });
  assert.equal(report.status, 'INCOMPLETE');
  assert.ok(report.diagnostics.some(d => d.code === 'EXTERNAL_SNAPSHOT_ERROR' && /deno\.json/.test(d.message)));
});

test('deno-audit without a lockfile is INCOMPLETE because Deno would report a false clean result', { skip }, (t: TestContext) => {
  const root = fixture(t, { 'deno.json': '{"imports":{"lodash":"npm:lodash@4.17.20"}}', 'src/main.ts': 'import _ from "lodash";\nexport const a = _.chunk([1], 1);\n' });
  const report = audit(root, getTS(), { integrations: ['deno-audit'] });
  assert.equal(report.status, 'INCOMPLETE');
  assert.ok(report.diagnostics.some(d => d.code === 'EXTERNAL_TOOL_ERROR' && /deno\.lock/.test(d.message)));
  assert.equal(report.results.length, 0);
});

test('deno-audit reports advisories with reachability from the entrypoint graph', { skip }, async (t: TestContext) => {
  const online = await fetch('https://registry.npmjs.org/lodash', { method: 'HEAD', signal: AbortSignal.timeout(5000) }).then(r => r.ok, () => false);
  if (!online) return t.skip('npm registry unreachable');
  const root = fixture(t, {
    'deno.json': '{"tasks":{"start":"deno run src/main.ts"},"imports":{"lodash":"npm:lodash@4.17.20"}}',
    'src/main.ts': 'import _ from "lodash";\nexport const a = _.chunk([1], 1);\n',
  });
  assert.equal(spawnSync('deno', ['cache', 'src/main.ts'], { cwd: root, encoding: 'utf8' }).status, 0);
  const before = listing(root);
  const report = audit(root, getTS(), { integrations: ['deno-audit'] });
  assert.equal(report.status, 'COMPLETE', JSON.stringify(report.diagnostics));
  const advisories = report.results.filter(f => f.code === 'DENO_AUDIT_ADVISORY');
  assert.ok(advisories.length > 0);
  assert.ok(advisories.every(f => f.file === 'deno.lock' && f.scope === 'config' && f.detail.startsWith('lodash ') && f.detail.endsWith('reachable from entrypoints')), JSON.stringify(advisories));
  assert.ok(advisories.some(f => f.severity === 'P2'));
  assert.deepEqual(listing(root), before);
});

test('missing Deno executable is reported as INCOMPLETE', (t: TestContext) => {
  const root = fixture(t, app);
  const saved = process.env['PATH'];
  t.after(() => { process.env['PATH'] = saved; });
  process.env['PATH'] = fixture(t, {});
  const report = audit(root, getTS(), { integrations: ['deno-check'] });
  assert.equal(report.status, 'INCOMPLETE');
  assert.equal(report.integrations?.[0]?.version, 'UNAVAILABLE');
});
