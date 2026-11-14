const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const { scan, audit, getTS } = require('./ts-rails-audit.cjs');

function fixture(t, entries) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-rails-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(entries)) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

const tick = String.fromCharCode(96);
const interpolation = '$' + '{';
const cases = [
  ['any is a lead', 'let value: any;', 'EXPLICIT_ANY', 1],
  ['unknown is not any', 'let value: unknown;', 'EXPLICIT_ANY', 0],
  ['any in strings/comments is ignored', 'const s = "any"; // any\n', 'EXPLICIT_ANY', 0],
  ['non-null assertion', 'const a = object!;', 'NON_NULL_ASSERTION', 1],
  ['logical negation is not an assertion', 'const a = !object;', 'NON_NULL_ASSERTION', 0],
  ['empty catch', 'try { run(); } catch {}', 'EMPTY_CATCH', 1],
  ['catch with behavior', 'try { run(); } catch (e) { throw e; }', 'EMPTY_CATCH', 0],
  ['raw JSON assertion', 'const a = JSON.parse(input) as User;', 'UNVALIDATED_JSON_CAST', 1],
  ['awaited response assertion', 'const a = (await response.json()) as User;', 'UNVALIDATED_JSON_CAST', 1],
  ['angle assertion', 'const a = <User>JSON.parse(input);', 'UNVALIDATED_JSON_CAST', 1],
  ['bracket JSON access', 'const a = JSON["parse"](input) as User;', 'UNVALIDATED_JSON_CAST', 1],
  ['raw JSON in conditional branch (upstream storage idiom)', 'const a = (typeof input === "string" ? JSON.parse(input) : input) as User;', 'UNVALIDATED_JSON_CAST', 1],
  ['raw JSON in fallback branch', 'const a = (cached ?? JSON.parse(input)) as User;', 'UNVALIDATED_JSON_CAST', 1],
  ['validation around conditional branch', 'const a = schema.parse(flag ? JSON.parse(input) : input) as User;', 'UNVALIDATED_JSON_CAST', 0],
  ['string containing JSON syntax', 'const a = "JSON.parse(input)" as string;', 'UNVALIDATED_JSON_CAST', 0],
  ['validator result is not raw JSON', 'const a = schema.parse(JSON.parse(input)) as User;', 'UNVALIDATED_JSON_CAST', 0],
  ['const assertion is not runtime type validation', 'const a = { mode: "x" } as const;', 'UNVALIDATED_JSON_CAST', 0],
  ['security toggle true', 'const options = { disableCSRFCheck: true };', 'AUTH_SECURITY_DISABLED', 1],
  ['quoted origin toggle', 'const options = { "disableOriginCheck": true };', 'AUTH_SECURITY_DISABLED', 1],
  ['literal computed security name', 'const options = { ["disableCSRFCheck"]: true };', 'AUTH_SECURITY_DISABLED', 1],
  ['security toggle false', 'const options = { disableCSRFCheck: false };', 'AUTH_SECURITY_DISABLED', 0],
  ['mapped fan-out', 'await Promise.all(rows.map(save));', 'POTENTIALLY_UNBOUNDED_CONCURRENCY', 1],
  ['fixed fan-out', 'await Promise.all([first(), second()]);', 'POTENTIALLY_UNBOUNDED_CONCURRENCY', 0],
  ['bounded map remains a review lead', 'await Promise.all(rows.slice(0, 4).map(save));', 'POTENTIALLY_UNBOUNDED_CONCURRENCY', 1],
  ['ts-ignore directive', '// @ts-ignore intentional\nrun();', 'TS_SUPPRESSION', 1],
  ['ts-nocheck directive', '// @ts-nocheck\nrun();', 'TS_SUPPRESSION', 1],
  ['expect-error is not blanket suppression', '// @ts-expect-error intentional\nrun();', 'TS_SUPPRESSION', 0],
  ['directive mentioned in prose', '// Document why @ts-ignore is discouraged.\nrun();', 'TS_SUPPRESSION', 0],
  ['string with directive', 'const s = "// @ts-ignore";', 'TS_SUPPRESSION', 0],
  ['regex containing directive', 'const r = /[//] @ts-ignore/;', 'TS_SUPPRESSION', 0],
  ['template tail with directive', 'const s = ' + tick + interpolation + 'value}// @ts-ignore' + tick + ';', 'TS_SUPPRESSION', 0],
  ['nested templates', 'const s = ' + tick + interpolation + tick + interpolation + 'x}// @ts-ignore' + tick + '}// @ts-nocheck' + tick + ';', 'TS_SUPPRESSION', 0],
  ['actual comment in template expression', 'const s = ' + tick + interpolation + '\n// @ts-ignore\nvalue}' + tick + ';', 'TS_SUPPRESSION', 1],
];

for (const [name, source, code, count] of cases) {
  test(name, (t) => {
    const root = fixture(t, { 'src/sample.ts': source });
    assert.equal(scan(root, ts).filter((f) => f.code === code).length, count);
  });
}

test('JSX text is not comment trivia', (t) => {
  const root = fixture(t, { 'view.tsx': 'const view = <div>// @ts-ignore</div>;' });
  assert.equal(scan(root, ts).filter((f) => f.code === 'TS_SUPPRESSION').length, 0);
});

test('heuristics never produce P0 or P1, including test-only auth config', (t) => {
  const root = fixture(t, { 'auth.test.ts': 'const testOptions = { disableCSRFCheck: true };' });
  const findings = scan(root, ts);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].confidence, 'HEURISTIC');
  assert.equal(findings[0].severity, 'P2');
  assert.equal(findings[0].scope, 'test');
});

test('Deno tasks: actual flags, JSONC comments, descriptions and script arguments', (t) => {
  const root = fixture(t, {
    'app.ts': 'export {};',
    'deno.jsonc': JSON.stringify({
      tasks: {
        start: 'deno run -A app.ts',
        test: { command: 'deno test --allow-all' },
        scoped: 'deno run --allow-net=localhost app.ts',
        explain: 'echo "deno run -A app.ts"',
        args: 'deno run app.ts -A',
        separator: 'deno run -- app.ts -A',
        config: 'deno run --config deno.json -A app.ts',
        configSafe: 'deno run --config deno.json app.ts -A',
      },
      description: '--allow-all is documented here',
    }, null, 2) + '\n// deno run --allow-all app.ts\n',
  });
  assert.equal(scan(root, ts).filter((f) => f.code === 'BROAD_DENO_PERMISSIONS').length, 3);
});

test('invalid Deno config marks report incomplete', (t) => {
  const root = fixture(t, { 'app.ts': 'export {};', 'deno.json': '{"tasks":' });
  const report = audit(root, ts);
  assert.equal(report.status, 'INCOMPLETE');
  assert.ok(report.diagnostics.some((d) => d.code === 'CONFIG_PARSE_ERROR'));
});

test('syntax errors are surfaced, not silently reported clean', (t) => {
  const root = fixture(t, { 'broken.ts': 'const x: = ;', 'good.ts': 'export {};' });
  const report = audit(root, ts);
  assert.equal(report.status, 'INCOMPLETE');
  assert.equal(report.filesDiscovered, 2);
  assert.equal(report.filesInspected, 1);
  assert.ok(report.diagnostics.some((d) => d.code === 'SOURCE_PARSE_ERROR' && d.file === 'broken.ts' && d.line === 1));
  assert.throws(() => scan(root, ts), /incomplete/i);
});

test('empty source scope is incomplete', (t) => {
  const report = audit(fixture(t, { 'README.md': 'Only docs' }), ts);
  assert.equal(report.status, 'INCOMPLETE');
  assert.ok(report.diagnostics.some((d) => d.code === 'NO_SOURCE_FILES'));
});

test('supported source extensions and explicit excluded scopes', (t) => {
  const root = fixture(t, {
    'src/index.ts': 'let a: any;',
    'src/module.mts': 'let a: any;',
    'src/module.cts': 'let a: any;',
    'src/view.tsx': 'let a: any;',
    'src/index.d.ts': 'declare const a: any;',
    'node_modules/a/index.ts': 'let a: any;',
    'dist/index.ts': 'let a: any;',
    'tests/feature.ts': 'let a: any;',
    'src/feature.spec.ts': 'let a: any;',
    'src/contest.ts': 'let a: any;',
  });
  const report = audit(root, ts, { excludeTests: true });
  assert.equal(report.filesInspected, 5);
  assert.equal(report.testsExcluded, 2);
  assert.equal(report.results.length, 5);
  assert.ok(report.skipped.some((s) => s.path === 'node_modules'));
});

test('path selection is scoped, deduplicated and rejects escapes', (t) => {
  const root = fixture(t, { 'src/a.ts': 'let a: any;', 'other/b.ts': 'let b: any;' });
  assert.equal(audit(root, ts, { paths: ['src', 'src/a.ts'] }).filesInspected, 1);
  assert.throws(() => audit(root, ts, { paths: ['..'] }), /outside|escape/i);
  assert.throws(() => audit(root, ts, { paths: ['missing'] }), /not exist|ENOENT/i);
});

test('oversized source is reported incomplete', (t) => {
  const root = fixture(t, { 'big.ts': 'export const x = 123;' });
  const report = audit(root, ts, { maxFileBytes: 8 });
  assert.equal(report.status, 'INCOMPLETE');
  assert.ok(report.diagnostics.some((d) => d.code === 'FILE_TOO_LARGE'));
});

test('results have stable locations and the audit never writes target files', (t) => {
  const root = fixture(t, { 'src/z.ts': '\nlet b: any;\n', 'src/a.ts': 'let a: any;\n' });
  const before = fs.readFileSync(path.join(root, 'src/z.ts'));
  const first = audit(root, ts);
  assert.deepEqual(first, audit(root, ts));
  assert.deepEqual(first.results.map((f) => [f.file, f.line]), [['src/a.ts', 1], ['src/z.ts', 2]]);
  assert.deepEqual(fs.readFileSync(path.join(root, 'src/z.ts')), before);
  assert.deepEqual(fs.readdirSync(root), ['src']);
  assert.equal(first.compilerVersion, ts.version);
});

test('explicit compiler API override rejects incompatible packages', (t) => {
  const root = fixture(t, { 'compiler.cjs': 'module.exports = {};' });
  const before = process.env.TS_RAILS_TYPESCRIPT_PATH;
  try {
    process.env.TS_RAILS_TYPESCRIPT_PATH = path.join(root, 'compiler.cjs');
    assert.throws(() => getTS(process.cwd()), /compiler API|incompatible/i);
  } finally {
    if (before === undefined) delete process.env.TS_RAILS_TYPESCRIPT_PATH;
    else process.env.TS_RAILS_TYPESCRIPT_PATH = before;
  }
});

test('default resolution never executes the target compiler package', (t) => {
  const root = fixture(t, { 'app.ts': 'export {};' });
  const moduleDir = path.join(root, 'node_modules/typescript');
  fs.mkdirSync(moduleDir, { recursive: true });
  const marker = path.join(root, 'AUDIT_WROTE.txt');
  fs.writeFileSync(path.join(moduleDir, 'index.js'),
    'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ', "executed");module.exports=require(' + JSON.stringify(require.resolve('typescript')) + ');');
  assert.equal(getTS(root).version, ts.version);
  assert.equal(fs.existsSync(marker), false, 'Target compiler must never execute by default');
});
