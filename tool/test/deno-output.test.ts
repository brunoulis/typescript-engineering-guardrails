import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseAudit, parseCheck, parseInfo, parseLint } from '../src/core/deno-output.js';

const snapshot = path.join(os.tmpdir(), 'rails-deno-fixture');
const url = (file: string): string => pathToFileURL(path.join(snapshot, file)).href;

test('parseCheck extracts TS diagnostics with snapshot-relative files', () => {
  const output = [
    'Check src/main.ts', 'Check src/dead.ts',
    'TS2322 [ERROR]: Type \'string\' is not assignable to type \'number\'.',
    'export const dead: number = "no";', '             ~~~~',
    '    at ' + url('src/dead.ts') + ':1:14', '',
    'error: Type checking failed.',
  ].join('\n');
  assert.deepEqual(parseCheck(output, snapshot), [{ code: 'TS2322', message: 'Type \'string\' is not assignable to type \'number\'.', file: 'src/dead.ts', line: 1 }]);
  assert.deepEqual(parseCheck('Check src/main.ts\n', snapshot), []);
});

test('parseLint maps diagnostics and fails closed on unexpected shapes', () => {
  const diagnostic = { filename: url('src/main.ts'), range: { start: { line: 3, col: 9, bytePos: 1 }, end: { line: 3, col: 12, bytePos: 4 } }, message: '`any` type is not allowed', code: 'no-explicit-any' };
  assert.deepEqual(parseLint(JSON.stringify({ version: 1, diagnostics: [diagnostic], errors: [] }), snapshot), [{ code: 'no-explicit-any', message: '`any` type is not allowed', file: 'src/main.ts', line: 3 }]);
  assert.throws(() => parseLint('{"version":1}', snapshot), /shape/);
  assert.throws(() => parseLint(JSON.stringify({ diagnostics: [{ filename: 'x' }], errors: [] }), snapshot), /shape/);
  assert.throws(() => parseLint(JSON.stringify({ diagnostics: [], errors: ['parse error'] }), snapshot), /errors/);
});

test('parseInfo returns reachable local files and npm packages including transitive ones', () => {
  const info = {
    roots: [url('src/main.ts')],
    modules: [
      { kind: 'esm', specifier: url('src/main.ts') }, { kind: 'esm', specifier: url('src/used.ts') },
      { kind: 'npm', specifier: 'npm:/lodash@4.17.20' }, { kind: 'npm', specifier: 'npm:/@scope/pkg@1.0.0/sub' },
    ],
    npmPackages: {
      'lodash@4.17.20': { name: 'lodash', version: '4.17.20', dependencies: ['inner@2.0.0'] },
      'inner@2.0.0': { name: 'inner', version: '2.0.0', dependencies: [] },
      'unused@1.0.0': { name: 'unused', version: '1.0.0', dependencies: [] },
    },
  };
  const graph = parseInfo(JSON.stringify(info), snapshot);
  assert.deepEqual([...graph.files].sort(), ['src/main.ts', 'src/used.ts']);
  assert.deepEqual([...graph.packages].sort(), ['@scope/pkg', 'inner', 'lodash']);
  assert.throws(() => parseInfo('{}', snapshot), /shape/);
});

const advisory = [
  '╭ Command Injection in lodash', '│ Severity:   high', '│ Package:    lodash', '│ Vulnerable: <4.17.21',
  '╰ Info:       https://github.com/advisories/GHSA-35jh-r3h4-6jhm', '',
].join('\n');
test('parseAudit reads advisories, skips warning boxes and checks the declared total', () => {
  const text = advisory + '\n╭ Warning\n│\n│  The following packages are deprecated:\n╰─\n\nFound 1 vulnerabilities\nSeverity: 0 low, 0 moderate, 1 high, 0 critical\n';
  assert.deepEqual(parseAudit(text), [{ title: 'Command Injection in lodash', severity: 'high', name: 'lodash', vulnerable: '<4.17.21', url: 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm' }]);
  assert.deepEqual(parseAudit('No known vulnerabilities found\n'), []);
});
test('parseAudit fails closed when the declared total or a field is missing', () => {
  assert.throws(() => parseAudit(advisory + '\nFound 2 vulnerabilities\n'), /shape/);
  assert.throws(() => parseAudit('error: network unreachable\n'), /shape/);
  assert.throws(() => parseAudit('╭ T\n│ Severity: high\n│ Package: x\n\nFound 1 vulnerabilities\n'), /shape/);
});
