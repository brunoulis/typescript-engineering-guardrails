import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { audit, getTS } from '../src/index.js';

function fixture(t: TestContext, entries: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-runtime-project-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(entries)) {
    const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content);
  }
  return root;
}

test('colocated Deno test names retain test scope and are excluded without hiding similarly named source', t => {
  const tests = ['src/service_test.ts', 'src/http_test.tsx', 'src/job_test.mts', 'src/module_test.cts', 'src/test.ts', 'src/handler.test.ts', 'src/handler.spec.ts'];
  const sources = ['src/test_driver.ts', 'src/contest.ts', 'src/latest_test_helper.ts'];
  const root = fixture(t, Object.fromEntries([...tests, ...sources].map(file => [file, 'export let boundary: any;'])));
  const all = audit(root, getTS());
  assert.equal(all.status, 'COMPLETE');
  for (const name of tests) assert.equal(all.results.find(f => f.file === name)?.scope, 'test', name);
  for (const name of sources) assert.equal(all.results.find(f => f.file === name)?.scope, 'source', name);
  const selected = audit(root, getTS(), { excludeTests: true });
  assert.equal(selected.testsExcluded, tests.length);
  assert.deepEqual(selected.results.map(f => f.file).sort(), [...sources].sort());
  assert.ok(tests.every(name => selected.skipped.some(s => s.path === name && s.reason === 'test scope')));
});

test('Deno project reports one actionable unsupported-semantic diagnostic without pretending it is tsconfig', t => {
  const root = fixture(t, {
    'deno.json': '{"imports":{"api-framework":"npm:hono@4.13.7"}}',
    'a.ts': 'export const value: number = 1;',
    'b.ts': 'export const other: number = 2;',
  });
  for (const options of [{ mode: 'typed' as const }, { mode: 'typed' as const, project: 'deno.json' }]) {
    const report = audit(root, getTS(), options);
    assert.equal(report.status, 'INCOMPLETE');
    assert.equal(report.filesDiscovered, 2);
    assert.equal(report.filesInspected, 0);
    assert.equal(report.diagnostics.length, 1);
    assert.equal(report.diagnostics[0]?.code, 'DENO_SEMANTICS_UNSUPPORTED');
    assert.match(report.diagnostics[0]?.message ?? '', /deno check/);
  }
  assert.equal(fs.existsSync(path.join(root, 'tsconfig.json')), false);
  assert.equal(audit(root, getTS(), { mode: 'syntax' }).status, 'COMPLETE');
});
test('unmeasurable test dimension does not list excluded tests as missing test evidence', t => {
  const root = fixture(t, {
    'src/value.ts': 'export const value = 1;',
    'src/value_test.ts': 'import {value} from "./value.ts"; if(value!==1)throw Error("bad");',
  });
  for (const options of [{ score: true, excludeTests: true }, { score: true, paths: ['src/value.ts'] }]) {
    const report = audit(root, getTS(), options);
    assert.equal(report.status, 'COMPLETE');
    assert.equal(report.score?.dimensions['tests']?.grade, null);
    assert.deepEqual(report.score?.dimensions['tests']?.evidence, []);
  }
});
