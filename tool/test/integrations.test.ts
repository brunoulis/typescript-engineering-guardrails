import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { audit, getTS } from '../src/index.js';
import { runBounded } from '../src/core/external-tools.js';

test('real pinned external tools analyze controlled snapshots without executing target configs', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-external-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'index.ts'), 'import { b } from "./b.js"; export const a: number = b;');
  fs.writeFileSync(path.join(root, 'b.ts'), 'import { a } from "./index.js"; export const b: number = a;');
  fs.writeFileSync(path.join(root, 'unused.ts'), 'export const unused = 123;');
  const marker = path.join(root, 'EXECUTED');
  const evil = 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ', "bad");throw Error("target config executed");';
  fs.writeFileSync(path.join(root, '.dependency-cruiser.cjs'), evil);
  fs.writeFileSync(path.join(root, 'knip.js'), evil);
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fixture","version":"1.0.0","scripts":{"postinstall":"exit 99"},"dependencies":{"never-used-dependency":"1.0.0","vite":"1.0.0"}}');
  fs.writeFileSync(path.join(root, 'vite.config.ts'), 'import fs from "node:fs";fs.writeFileSync(' + JSON.stringify(marker) + ', "bad"); export default {};');
  const before = fs.readdirSync(root).sort();
  const report = audit(root, getTS(), { integrations: ['knip', 'dependency-cruiser'] });
  assert.equal(report.status, 'COMPLETE', JSON.stringify(report.diagnostics));
  assert.equal(report.integrations?.length, 2);
  assert.ok(report.results.some(f => f.code === 'KNIP_UNUSED_FILE' && f.file === 'unused.ts'), JSON.stringify(report));
  assert.ok(report.results.some(f => f.code === 'EXTERNAL_DEPENDENCY_CYCLE'), JSON.stringify(report));
  assert.ok(report.results.some(f => f.code === 'KNIP_UNUSED_DEPENDENCY' && f.file === 'package.json' && f.detail.includes('never-used-dependency')), JSON.stringify(report));
  assert.equal(fs.existsSync(marker), false);
  assert.deepEqual(fs.readdirSync(root).sort(), before);
});
test('late external snapshot diagnostics make every score dimension unevaluated', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-score-error-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'index.ts'), 'export function value() { return 123; }');
  fs.writeFileSync(path.join(root, 'package.json'), '{');
  const report = audit(root, getTS(), { score: true, integrations: ['knip'] });
  assert.equal(report.status, 'INCOMPLETE');
  assert.ok(report.diagnostics.some(d => d.code === 'EXTERNAL_SNAPSHOT_ERROR'));
  assert.ok(report.score);
  assert.ok(Object.values(report.score.dimensions).every(d => d.grade === null));
});
test('external child execution is actually terminated by its timeout and invalid exits fail', () => {
  assert.throws(() => runBounded(process.execPath, ['-e', 'setTimeout(() => process.stdout.write("{}"), 2000)'], os.tmpdir(), 50), /time|ETIMEDOUT/i);
  assert.throws(() => runBounded(process.execPath, ['-e', 'process.exit(7)'], os.tmpdir()), /exit 7/);
});
