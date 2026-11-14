const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cli = path.join(__dirname, 'ts-rails-audit.cjs');

function run(t, source, args = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-rails-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  if (source !== null) fs.writeFileSync(path.join(root, 'sample.ts'), source);
  return spawnSync(process.execPath, [cli, '--root', root, ...args], { encoding: 'utf8', env: { ...process.env, TS_RAILS_TYPESCRIPT_PATH: require.resolve('typescript') } });
}

test('JSON report is parseable and signals do not fail by default', (t) => {
  const result = run(t, 'let a: any;', ['--format', 'json']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'COMPLETE');
  assert.equal(report.results.length, 1);
  assert.equal(result.stderr, '');
});
test('explicit signal gate returns 2', (t) => {
  assert.equal(run(t, 'let a: any;', ['--fail-on-signals']).status, 2);
});
test('syntax errors return 1 even with the signal gate enabled', (t) => {
  const result = run(t, 'const a: = ;', ['--format', 'json', '--fail-on-signals']);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).status, 'INCOMPLETE');
});
test('empty scope returns 1', (t) => {
  assert.equal(run(t, null).status, 1);
});
for (const args of [['--format', 'csv'], ['--root'], ['--format'], ['--path'], ['--wat']]) {
  test('usage error ' + args.join(' '), (t) => {
    const result = run(t, 'export {};', args);
    assert.equal(result.status, 1);
    assert.notEqual(result.stderr, '');
    assert.equal(result.stdout, '');
  });
}
test('help works without a compiler installation', () => {
  const result = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8', env: { ...process.env, TS_RAILS_TYPESCRIPT_PATH: 'not-installed' } });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage/);
});
test('text report includes completeness and heuristic caveat', (t) => {
  const result = run(t, 'export {};');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /COMPLETE/);
  assert.match(result.stdout, /not proven vulnerabilities/i);
});
