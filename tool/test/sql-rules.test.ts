import type { TestContext } from 'node:test';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { audit, getTS } from '../src/index.js';

function run(t: TestContext, files: Record<string, string>, options: Parameters<typeof audit>[2] = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-sql-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return audit(root, getTS(), options);
}
const codes = (report: ReturnType<typeof audit>): string[] => report.results.filter(f => /^(SQL_|ORACLE_)/.test(f.code)).map(f => f.code + ':' + f.line);
const header = 'interface Db { execute(sql: string, binds: unknown[]): unknown; query(sql: string | { text: string }): unknown }\n';

test('constant fragments and numbered placeholders are not reported', t => {
  const report = run(t, { 'a.ts': header + [
    'const COLUMNS = "id, name";',
    'const FILTER = `status = 1 AND ${COLUMNS} IS NOT NULL`;',
    'export function a(db: Db, n: number) {',
    '  db.execute(`SELECT ${COLUMNS} FROM t WHERE ${FILTER} OFFSET :${n + 1} ROWS`, []);',
    '  db.query(`SELECT * FROM t WHERE id = $${n}`);',
    '}',
  ].join('\n') });
  assert.deepEqual(codes(report), []);
});

test('non-constant interpolation, concatenation, indirection and object form are reported', t => {
  const report = run(t, { 'a.ts': header + [
    'export function a(db: Db, filter: string, id: string) {',
    '  db.execute(`SELECT * FROM t WHERE ${filter}`, []);', // line 3
    '  db.execute("SELECT * FROM t WHERE id = " + id, []);', // line 4
    '  const q = `DELETE FROM t WHERE id = ${id}`;', // line 5
    '  db.execute(q, []);',
    '  db.query({ text: `SELECT * FROM t WHERE a = ${filter}` });', // line 7
    '}',
  ].join('\n') });
  assert.deepEqual(codes(report), ['SQL_STRING_INTERPOLATION:3', 'SQL_STRING_INTERPOLATION:4', 'SQL_STRING_INTERPOLATION:5', 'SQL_STRING_INTERPOLATION:7']);
});

test('interpolated identifiers and clauses get their own code', t => {
  const report = run(t, { 'a.ts': header + 'export function a(db: Db, order: string, table: string) {\n  db.execute(`SELECT * FROM t ORDER BY ${order}`, []);\n  db.execute(`SELECT * FROM ${table}`, []);\n}\n' });
  assert.deepEqual(codes(report), ['SQL_DYNAMIC_IDENTIFIER:3', 'SQL_DYNAMIC_IDENTIFIER:4']);
});

test('a parameter shadowing a constant is not treated as the constant', t => {
  const report = run(t, { 'a.ts': header + 'const COLUMNS = "id";\nexport function a(db: Db, COLUMNS: string) {\n  db.execute(`SELECT ${COLUMNS} FROM t`, []);\n}\n' });
  assert.deepEqual(codes(report), ['SQL_STRING_INTERPOLATION:4']);
});

test('calls that are not SQL are ignored', t => {
  const report = run(t, { 'a.ts': 'interface Req { query(name: string): string }\nexport function a(req: Req, name: string, db: { query(s: string): void }) {\n  req.query(`${name}`);\n  db.query(`hello ${name}`);\n}\n' });
  assert.deepEqual(codes(report), []);
});

test('imported constants stay leads because the rule does not follow imports', t => {
  const report = run(t, { 'a.ts': header + 'import { COLUMNS } from "./cols.ts";\nexport function a(db: Db) {\n  db.execute(`SELECT ${COLUMNS} FROM t`, []);\n}\n', 'cols.ts': 'export const COLUMNS = "id";\n' });
  assert.deepEqual(codes(report), ['SQL_STRING_INTERPOLATION:4']);
});
