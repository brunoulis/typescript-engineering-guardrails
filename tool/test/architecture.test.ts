import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { TestContext } from 'node:test';
import ts from 'typescript';
import type { AuditOptions, AuditReport } from '../src/types/report.js';
import type { TypedContext } from '../src/interfaces/typed-context.js';
import { analyzeProject } from '../src/core/dependency-graph.js';

function analyze(t: TestContext, files: Record<string, string>, options: AuditOptions = {}, compilerOptions?: ts.CompilerOptions, scope: { selected?: string[]; incomplete?: boolean } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-architecture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = new Map<string, ts.SourceFile>();
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text);
    if (/\.[cm]?tsx?$/.test(file)) sources.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
  }
  let typed: TypedContext | undefined;
  if (compilerOptions) {
    const program = ts.createProgram([...sources.keys()], { noLib: true, types: [], ...compilerOptions });
    typed = { programs: [program], sources: new Map([...sources.keys()].map(file => [file, { source: program.getSourceFile(file)!, checker: program.getTypeChecker(), program }])), projects: [], externalReads: [] };
  }
  const report: AuditReport = { schemaVersion: 1, root, compilerVersion: ts.version, status: 'COMPLETE', filesDiscovered: sources.size, filesInspected: sources.size, configsInspected: 0, testsExcluded: 0, skipped: [], diagnostics: [], disclaimer: '', results: [] };
  if (scope.selected) for (const file of sources.keys()) if (!scope.selected.includes(path.relative(root, file).replaceAll('\\', '/'))) sources.delete(file);
  if (scope.incomplete) report.diagnostics.push({ code: 'TEST_INCOMPLETE', file: 'a.ts', line: 1, message: 'Fixture marks analysis incomplete' });
  analyzeProject(root, ts, sources, options, report, typed);
  return report;
}

test('resolves tsconfig aliases and reexports with concrete runtime cycles', t => {
  const report = analyze(t, { 'src/a.ts': 'export { b } from "@app/b";', 'src/b.ts': 'import { a } from "./a.js"; export const b = a;' }, {}, { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, paths: { '@app/*': ['./src/*'] } });
  assert.deepEqual(report.graph?.edges.map(e => [e.from, e.to, e.typeOnly]), [['src/a.ts', 'src/b.ts', false], ['src/b.ts', 'src/a.ts', false]]);
  assert.ok(report.results.some(f => f.code === 'DEPENDENCY_CYCLE' && f.detail.includes('src/a.ts -> src/b.ts -> src/a.ts')));
});

test('typed graph reuses resolved local package-import symbols without rereading package configuration', t => {
  const report = analyze(t, { 'package.json': '{"type":"module","imports":{"#local":"./src/b.ts"}}', 'src/a.ts': 'export { value } from "#local";', 'src/b.ts': 'export const value = 1;' }, {}, { moduleResolution: ts.ModuleResolutionKind.NodeNext, module: ts.ModuleKind.NodeNext });
  assert.deepEqual(report.graph?.edges.map(edge => [edge.from, edge.to]), [['src/a.ts', 'src/b.ts']]);
});

test('type-only reexports and individual specifiers never form runtime cycles', t => {
  const report = analyze(t, { 'a.ts': 'export type { B } from "./b"; import { type B } from "./b";', 'b.ts': 'export { a } from "./a";' });
  assert.equal(report.graph?.edges.filter(e => e.typeOnly).length, 2);
  assert.equal(report.results.filter(f => f.code === 'DEPENDENCY_CYCLE').length, 0);
});

test('boundaries use path segments and configured packages, with test scope retained', t => {
  const report = analyze(t, { 'domain/a.ts': 'import type { Context } from "hono";', 'domainish/b.ts': 'import { Hono } from "hono";', 'domain/a.test.ts': 'export { Hono } from "hono";' }, { boundaries: [{ from: 'domain', disallow: ['hono'] }] });
  assert.deepEqual(report.results.map(f => [f.code, f.file, f.scope]), [['FORBIDDEN_DEPENDENCY', 'domain/a.test.ts', 'test'], ['FORBIDDEN_DEPENDENCY', 'domain/a.ts', 'source']]);
  assert.equal(analyze(t, { 'domain/a.ts': 'import { Hono } from "hono";' }).results.length, 0);
});

test('clone evidence normalizes local bindings but preserves calls, literals and properties', t => {
  const report = analyze(t, {
    'a.ts': 'function a(value:number) { const total = value + 1; emit(total); return {count: total, label: "same"}; }',
    'b.ts': 'function b(input:number) { const result = input + 1; emit(result); return {count: result, label: "same"}; }',
    'c.ts': 'function c(input:number) { const result = input + 2; emit(result); return {count: result, label: "other"}; }',
    'd.ts': 'function d(input:number) { const result = input + 1; save(result); return {count: result, label: "same"}; }',
    'e.ts': 'function e(input:number) { const result = input + 1; emit(result); return {sum: result, label: "same"}; }',
  }, { score: true, cloneMinTokens: 10 });
  assert.equal(report.results.filter(f => f.code === 'DUPLICATE_BODY').length, 1);
  assert.equal(report.score?.dimensions.duplication?.grade, 2);
  assert.equal(analyze(t, { 'a.ts': 'function a(x:number){return x+1;} function b(y:number){return y+1;}' }, { score: true }).results.filter(f => f.code === 'DUPLICATE_BODY').length, 0);
});

test('complexity counts branches per function and skips nested function decisions', t => {
  const branches = Array.from({ length: 15 }, (_, i) => `if (x === ${i}) x++;`).join('');
  const report = analyze(t, { 'a.ts': `function complex(x:number) { ${branches} return x; } function outer() { return function inner(x:number) { ${branches} return x; }; }` }, { score: true });
  assert.equal(report.results.filter(f => f.code === 'HIGH_COMPLEXITY').length, 2);
});

test('an expression-bodied factory does not inherit the returned function complexity', t => {
  const branches = Array.from({ length: 15 }, (_, i) => `if (x === ${i}) x++;`).join('');
  const report = analyze(t, { 'a.ts': `const factory = () => (x:number) => { ${branches} return x; };` }, { score: true });
  assert.equal(report.results.filter(f => f.code === 'HIGH_COMPLEXITY').length, 1);
});

test('delegation requires multiple forwarding methods and excludes implemented contracts or argument work', t => {
  const report = analyze(t, { 'a.ts': 'class Wrapper { a(x:number){return this.inner.a(x);} b(x:number){return this.inner.b(x);} } class Contract implements API { a(x:number){return this.inner.a(x);} b(x:number){return this.inner.b(x);} } class Useful { a(x:number){return this.inner.a(x+1);} b(x:number){return this.inner.b(x);} } class Single { a(x:number){return this.inner.a(x);} }' }, { score: true });
  assert.equal(report.results.filter(f => f.code === 'DELEGATING_LAYER').length, 1);
});

test('tests score follows transitive imports and explicitly does not report coverage', t => {
  const report = analyze(t, { 'src/a.ts': 'export const a = 1;', 'src/b.ts': 'export const b = 1;', 'src/index.ts': 'export { a } from "./a";', 'tests/a.test.ts': 'import { a } from "../src/index";' }, { score: true });
  assert.deepEqual(report.score?.dimensions.tests?.evidence.map(e => e.file), ['src/b.ts']);
  assert.match(report.score?.dimensions.tests?.note ?? '', /coverage/i);
  assert.equal(analyze(t, { 'src/a.ts': 'export const a = 1;' }, { score: true, excludeTests: true }).score?.dimensions.tests?.grade, null);
});

test('disabled rules leave corresponding grades unevaluated', t => {
  const report = analyze(t, { 'a.ts': 'function a(x:number){return x+1;} function b(y:number){return y+1;}' }, { score: true, cloneMinTokens: 3, rules: { DUPLICATE_BODY: false } });
  assert.equal(report.score?.dimensions.duplication?.grade, null);
  assert.equal(report.results.filter(f => f.code === 'DUPLICATE_BODY').length, 0);
});

test('incomplete reports retain evidence but do not grade uninspected scope as clean', t => {
  const report = analyze(t, { 'a.ts': 'export const value = 1;' }, { score: true }, undefined, { incomplete: true });
  assert.ok(Object.values(report.score?.dimensions ?? {}).every(dimension => dimension.grade === null));
  assert.equal(report.score?.dimensions.tests?.evidence.length, 1);
});

test('typed context completes selected cycles without producing findings outside selected paths', t => {
  const report = analyze(t, { 'a.ts': 'export { b } from "./b";', 'b.ts': 'export { a } from "./a"; import { Hono } from "hono";' }, { score: true, boundaries: [{ from: 'b.ts', disallow: ['hono'] }] }, { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext }, { selected: ['a.ts'] });
  assert.equal(report.graph?.edges.length, 2);
  assert.equal(report.results.filter(f => f.code === 'DEPENDENCY_CYCLE').length, 1);
  assert.ok(report.results.every(f => f.file === 'a.ts'));
});

test('a selected vertex in a cyclic component is reported even when DFS first closes a context-only cycle', t => {
  const report = analyze(t, { 'a.ts': 'export { b } from "./b"; export { z } from "./z";', 'b.ts': 'export { a } from "./a";', 'z.ts': 'export { b } from "./b";' }, {}, { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext }, { selected: ['z.ts'] });
  assert.equal(report.results.filter(f => f.code === 'DEPENDENCY_CYCLE').length, 1);
  assert.match(report.results[0]?.detail ?? '', /z.ts -> b.ts -> a.ts -> z.ts/);
});

test('configured local boundaries resolve targets and reject only the declared layer', t => {
  const report = analyze(t, { 'domain/a.ts': 'export { value } from "../http/value";', 'domain/b.ts': 'export { value } from "../httpish/value";', 'http/value.ts': 'export const value = 1;', 'httpish/value.ts': 'export const value = 2;' }, { boundaries: [{ from: 'domain', disallow: ['http'] }] });
  assert.deepEqual(report.results.map(f => [f.code, f.file]), [['FORBIDDEN_DEPENDENCY', 'domain/a.ts']]);
});

test('CLI keeps graph and scores opt-in and exposes unevaluated excluded-test evidence', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-score-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'a.ts'), 'export const value = 1;');
  const cli = path.resolve('scripts/ts-rails-audit.cjs');
  const run = (flags: string[]): AuditReport => {
    const result = spawnSync(process.execPath, [cli, '--root', root, '--format', 'json', ...flags], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout) as AuditReport;
  };
  const plain = run([]);
  assert.equal(plain.score, undefined); assert.equal(plain.graph, undefined);
  const scored = run(['--score', '--exclude-tests']);
  assert.equal(scored.score?.dimensions.tests?.grade, null);
  assert.equal(scored.graph?.version, 1);
});

test('destructured shorthand property names remain semantic in clone comparisons', t => {
  const report = analyze(t, { 'a.ts': 'function a(value:Record<string,number>) { const {first} = value; return first + 1; } function b(value:Record<string,number>) { const {second} = value; return second + 1; }' }, { score: true, cloneMinTokens: 3 });
  assert.equal(report.results.filter(f => f.code === 'DUPLICATE_BODY').length, 0);
});

test('regex literals cannot hide different trailing body literals as scanner comments', t => {
  const report = analyze(t, { 'a.ts': 'function a() { const pattern = /[//]/; return "first"; }', 'b.ts': 'function b() { const matcher = /[//]/; return "second"; }' }, { score: true, cloneMinTokens: 3 });
  assert.equal(report.results.filter(f => f.code === 'DUPLICATE_BODY').length, 0);
});

test('empty parser lists contribute no tokens toward the clone threshold', t => {
  const report = analyze(t, { 'a.ts': 'function a() {} function b() {}' }, { score: true, cloneMinTokens: 3 });
  assert.equal(report.results.filter(f => f.code === 'DUPLICATE_BODY').length, 0);
});

test('a named type specifier remains separate from runtime edges in mixed imports and exports', t => {
  const report = analyze(t, { 'a.ts': 'import { type T, value } from "./b"; export { type T, value } from "./b";', 'b.ts': 'export type T = number; export const value = 1;' });
  assert.deepEqual(report.graph?.edges.map(edge => edge.typeOnly), [false, false, true, true]);
});

test('grade buckets count independent evidence without a combined score', t => {
  for (const [count, grade] of [[0, 3], [1, 2], [2, 2], [3, 1], [9, 1], [10, 0]] as const) {
    const files = Object.fromEntries(Array.from({ length: count }, (_, index) => [`a${index}.ts`, `export const value = ${index};`]));
    const report = analyze(t, files, { score: true });
    assert.equal(report.score?.dimensions.tests?.grade, grade);
    assert.equal(report.score?.dimensions.tests?.evidence.length, count);
  }
});
