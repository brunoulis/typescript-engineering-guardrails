import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { TestContext } from 'node:test';
import { audit, files, getTS } from '../src/index.js';

function project(t: TestContext, source: string, extras: Record<string, string> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-project-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries({ 'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true, types: [], target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' }, include: ['*.ts'] }), 'a.ts': source, ...extras })) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}
test('awaiting array forEach cannot join async callbacks', t => {
  const root = project(t, [
    'async function run(xs: number[], values: readonly number[], save: (v: number) => Promise<void>) {',
    '  await xs.forEach(async x => { await save(x); });',
    '  await (values.forEach(save));',
    '  await xs.forEach(x => { void x; });',
    '  await Promise.all(xs.map(save));',
    '  const custom = { async forEach(cb: typeof save) { await cb(1); } };',
    '  await custom.forEach(save);',
    '  xs.forEach(save);',
    '  await values.forEach(x => x > 0 ? save(x) : undefined);',
    '  await (await xs["forEach"](save));',
    '}',
  ].join('\n'));
  const report = audit(root, getTS(), { mode: 'typed' });
  assert.equal(report.status, 'COMPLETE', JSON.stringify(report.diagnostics));
  assert.deepEqual(report.results.filter(f => f.code === 'AWAIT_ASYNC_FOREACH').map(f => f.line), [2, 3, 10]);
});

test('solution references are inspected without builds and missing references stay incomplete', t => {
  const root = project(t, 'export {};', {
    'tsconfig.json': '{"files":[],"references":[{"path":"./lib"}]}',
    'lib/tsconfig.json': '{"compilerOptions":{"composite":true,"strict":true,"types":[]},"files":["index.ts"]}',
    'lib/index.ts': 'export const answer: number = 42;',
  });
  const report = audit(root, getTS(), { mode: 'typed', paths: ['lib'] });
  assert.equal(report.status, 'COMPLETE', JSON.stringify(report.diagnostics));
  assert.equal(report.filesInspected, 1);
  assert.deepEqual(report.semantic?.projects, ['tsconfig.json', 'lib/tsconfig.json']);
  assert.deepEqual(fs.readdirSync(path.join(root, 'lib')).sort(), ['index.ts', 'tsconfig.json']);
  fs.unlinkSync(path.join(root, 'lib/tsconfig.json'));
  const missing = audit(root, getTS(), { mode: 'typed', paths: ['lib'] });
  assert.equal(missing.status, 'INCOMPLETE');
  assert.ok(missing.diagnostics.some(d => d.code === 'PROJECT_CONFIG_ERROR'));
});

test('typed JSON rule resolves builtin aliases and excludes serializers and shadowed globals', (t) => {
  const root = project(t, 'const parse = JSON.parse; export const a = parse("{}") as {id: string};\nconst custom = {json: () => "ok"}; export const b = custom.json() as string;');
  const report = audit(root, getTS(), { mode: 'typed' });
  assert.equal(report.status, 'COMPLETE', JSON.stringify(report.diagnostics));
  assert.equal(report.results.filter(f => f.code === 'UNVALIDATED_JSON_CAST').length, 1);
  assert.equal(report.results.find(f => f.code === 'UNVALIDATED_JSON_CAST')?.line, 1);
  assert.equal(report.mode, 'typed');
  const shadowed = project(t, 'const JSON = {parse: (_: string) => ({id: "x"})}; export const x = JSON.parse("{}") as {id:string};');
  assert.equal(audit(shadowed, getTS(), { mode: 'typed' }).results.filter(f => f.code === 'UNVALIDATED_JSON_CAST').length, 0);
});

test('typed concurrency retains dynamic maps but proves small tuple bounds', (t) => {
  const root = project(t, 'const all = Promise.all.bind(Promise); const xs = [1,2] as const; void Promise.all(xs.map(async x => x));\nexport function run(xs: number[]) { return all(xs.map(async x => x)); }');
  const report = audit(root, getTS(), { mode: 'typed' });
  assert.equal(report.status, 'COMPLETE', JSON.stringify(report.diagnostics));
  assert.equal(report.results.filter(f => f.code === 'POTENTIALLY_UNBOUNDED_CONCURRENCY').length, 1);
  assert.equal(report.results.find(f => f.code === 'POTENTIALLY_UNBOUNDED_CONCURRENCY')?.line, 2);
});

test('typed missing imports and selected files outside tsconfig are incomplete', (t) => {
  const root = project(t, 'import { x } from "missing-package"; export {x};', { 'outside.ts': 'export const value = 1;', 'tsconfig.json': '{"compilerOptions":{"types":[]},"files":["a.ts"]}' });
  const report = audit(root, getTS(), { mode: 'typed' });
  assert.equal(report.status, 'INCOMPLETE');
  assert.ok(report.diagnostics.some(d => d.code === 'TS2307'));
  assert.ok(report.diagnostics.some(d => d.code === 'OUTSIDE_PROJECT' && d.file === 'outside.ts'));
});

test('typed config is required and never silently falls back to syntax', (t) => {
  const root = project(t, 'export {};');
  fs.unlinkSync(path.join(root, 'tsconfig.json'));
  assert.equal(audit(root, getTS(), { mode: 'typed' }).status, 'INCOMPLETE');
});
test('target noCheck cannot hide missing imports or type errors from typed audit', (t) => {
  const root = project(t, 'import {x} from "missing-package"; export const value:number="wrong"; export {x};', {
    'tsconfig.json': '{"compilerOptions":{"strict":true,"types":[],"noCheck":true},"files":["a.ts"]}',
  });
  const report = audit(root, getTS(), { mode: 'typed' });
  assert.equal(report.status, 'INCOMPLETE');
  assert.ok(report.diagnostics.some(d => d.code === 'TS2322'));
  assert.ok(report.diagnostics.some(d => d.code === 'TS2307'));
});
test('typed audit accepts Windows short root paths without treating in-root types as external', { skip: process.platform !== 'win32' }, t => {
  const root = project(t, 'export const response: Response = new Response();', {
    'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true, types: ['node'], lib: ['ES2022'], target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' }, files: ['a.ts'] }),
  });
  fs.mkdirSync(path.join(root, 'node_modules/@types'), { recursive: true });
  fs.cpSync(path.resolve('node_modules/@types/node'), path.join(root, 'node_modules/@types/node'), { recursive: true });
  fs.cpSync(path.resolve('node_modules/undici-types'), path.join(root, 'node_modules/undici-types'), { recursive: true });
  const alias = spawnSync('cmd.exe', ['/d', '/u', '/c', `for %I in ("${root}") do @echo %~sI`], {
    encoding: 'utf16le', windowsVerbatimArguments: true,
  });
  assert.equal(alias.status, 0, alias.stderr);
  const shortRoot = alias.stdout.trim();
  if (shortRoot.toLowerCase() === fs.realpathSync.native(root).toLowerCase()) {
    t.skip('The temporary volume does not provide 8.3 aliases'); return;
  }
  const report = audit(shortRoot, getTS(), { mode: 'typed' });
  assert.equal(report.status, 'COMPLETE', JSON.stringify(report.diagnostics));
  assert.equal(report.filesInspected, 1);
  assert.equal(fs.realpathSync.native(report.root), report.root);
  assert.deepEqual(files(shortRoot), [path.join(fs.realpathSync.native(root), 'a.ts')]);
});

for (const libs of [['ES2022'], ['ES2022', 'DOM']]) {
  test('Node fetch/Response/Request JSON boundaries remain visible with libraries ' + libs.join(','), t => {
    const root = project(t, `export async function read(response: Response, request: Request) {
const a = await (await fetch('https://example.test')).json() as {id:string};
const b = await response.json() as {id:string};
const c = await request.json() as {id:string};
const serializer = Response.json({id:'ok'}) as Response;
const custom = {json:()=>({id:'valid'})}; const safe = custom.json() as {id:string};
return {a,b,c,serializer,safe}; }`, { 'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true, types: ['node'], lib: libs, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' }, files: ['a.ts'] }) });
    fs.mkdirSync(path.join(root, 'node_modules/@types'), { recursive: true });
    fs.cpSync(path.resolve('node_modules/@types/node'), path.join(root, 'node_modules/@types/node'), { recursive: true });
    fs.cpSync(path.resolve('node_modules/undici-types'), path.join(root, 'node_modules/undici-types'), { recursive: true });
    const report = audit(root, getTS(), { mode: 'typed' });
    assert.equal(report.status, 'COMPLETE', JSON.stringify(report.diagnostics));
    assert.deepEqual(report.results.filter(f => f.code === 'UNVALIDATED_JSON_CAST').map(f => f.line), [2, 3, 4]);
  });
}

test('typed CLI resolves a tsconfig and reports actual compiler diagnostics', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-typed-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, types: [], target: 'ES2022' }, files: ['a.ts'] }));
  fs.writeFileSync(path.join(root, 'a.ts'), 'export const answer: number = "wrong";');
  const cli = path.resolve('scripts/ts-rails-audit.cjs');
  const result = spawnSync(process.execPath, [cli, '--root', root, '--mode', 'typed', '--format', 'json'], { encoding: 'utf8' });
  assert.notEqual(result.stdout, '', result.stderr);
  const report = JSON.parse(result.stdout) as { status: string; diagnostics: { code: string }[] };
  assert.equal(report.status, 'INCOMPLETE');
  assert.ok(report.diagnostics.some(d => d.code === 'TS2322'));
});
