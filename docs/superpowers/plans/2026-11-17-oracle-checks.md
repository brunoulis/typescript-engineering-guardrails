# Oracle checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the auditor Oracle-aware evidence that the syntax rules lack: a local SQL-interpolation lead (two codes) and an environment `doctor` that compares the installed Oracle client with the driver's minimum, plus the Oracle reference profile.

**Architecture:** `tool/src/rules/sql.ts` is one more per-file syntax pass wired next to `inspectFrameworks`; it matches the call by method name and SQL-shaped static text, never by receiver, so wrappers such as `withOracleConnection(executor => executor.execute(…))` are covered. `doctor oracle` is a separate subcommand (`doctor-cli.ts` → `core/oracle-doctor.ts`) that reads file names and source text only; it never loads a library or connects.

**Tech Stack:** TypeScript 6.0.3 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Node ≥22.13 `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-17-deno-oracle-integrations-design.md` (section 2). **Prerequisite:** Plan A (`2026-11-17-deno-integrations.md`) merged into `main`.

---

## Scope, evidence and decisions

**Machine-load policy (read first).** An earlier session froze the workstation while a full test run and several builds ran at once. In this plan: run test files **one at a time** with `timeout`, never `npm run verify`, never the corpus or runtime-project tests, never a build in parallel with another build, and run subagents **sequentially**. The tasks below name the exact test files to run.

This is **Plan B of three** (A = Deno integrations, done; C = opt-in `deno-test`, later).

All code in this plan was run in scratch copies of the repository before it was written: it compiles under the strict `tsconfig.json`, the 17 new tests pass, `frameworks` (5), `ts-rails-regression` (45), `ts-rails-cli` (11), `architecture` (20) and `deno-output` (5) still pass, and the reference run below reproduces the manual review.

**Reference run (2026-11-17, private Deno + Oracle backend, 173 TypeScript files, snapshot without `.env`):**

| Check | Result |
| --- | --- |
| `SQL_*` rules | 3 findings in one file (`SQL_STRING_INTERPOLATION` ×2 on a `query` parameter, `SQL_DYNAMIC_IDENTIFIER` ×1 on an `order` parameter). Reading the file, every caller passes string literals, so all 3 are cleared leads, not injection. The rules flag no other file. |
| `doctor oracle` | `TOO_OLD`, exit 2: driver mode thick (3 lines with `initOracleClient` / `thin = false`), client 12.2.0 found on `PATH` through the Oracle home path, minimum 19.1. The same machine's real test run failed with `DPI-1050` (client 12.2, 19.1 or higher needed). Two Linux `libocci.so` files are tracked in the Windows project tree (listed as foreign-platform libraries). |
| Existing rules | Counts unchanged (`EXPLICIT_ANY` 62, `NON_NULL_ASSERTION` 132, …). |

**Dropped from the spec: `ORACLE_TEST_NOT_HERMETIC`.** It was implemented and measured, then removed. It flagged 10 test files that reach `oracledb` through static imports, but in the real run only 1 of them failed without a client (the one whose code initialises thick mode at load); the other 9 passed. A static import path does not decide when the native client loads, so the rule had about 10 % precision. `references/oracle.md` tells the reader to decide by running the test with the client absent.

Decisions assumed (change them before executing if you disagree):

1. **Rule names:** `SQL_STRING_INTERPOLATION` and `SQL_DYNAMIC_IDENTIFIER`, both P2 HEURISTIC, database-agnostic (they also see `pg` `query` calls); the Oracle context lives in the reference.
2. **`doctor` minimum:** default `19.1`, the minimum observed for `oracledb` 7.0.1, overridable with `--min-client`. It is not a claim about other driver versions (R0a).
3. **`doctor` stays metadata-only:** the client version comes from the file suffix, an `instantclient_X_Y` directory or an Oracle home path; otherwise `VERSION_UNKNOWN` (exit 1). Loading the library to ask it is not done.
4. **No interprocedural clearing:** a helper parameter that only ever receives literals stays a lead (as the 3 above). Following call sites is out of scope.

## File structure

| File | Responsibility |
| --- | --- |
| Create `tool/src/rules/sql.ts` | SQL interpolation rules (`inspectSql`) |
| Create `tool/src/core/oracle-doctor.ts` | Client discovery, version, mode, foreign libraries (`oracleDoctor`, `doctorText`) |
| Create `tool/src/doctor-cli.ts` | `doctor oracle` argument handling and exit codes |
| Modify `tool/src/constants/rules.ts`, `tool/src/core/audit.ts` | Register the two codes; run `inspectSql` after `inspectFrameworks` |
| Modify `tool/src/cli.ts` | Dispatch `doctor`; usage text |
| Create `tool/test/sql-rules.test.ts`, `oracle-doctor.test.ts`, `oracle-doctor-cli.test.ts` | Tests |
| Create `references/oracle.md`; modify `references/scanner.md`, `SKILL.md` | Documentation |
| Create `docs/verification/2026-11-17-oracle-checks.md` | Recorded evidence |

Working directory: the repository root. New files may use LF; the working tree uses CRLF, so edits to existing files use the CRLF-safe scripts below.

---

### Task 0: Branch

- [ ] **Step 1: Confirm Plan A is in `main` and start a branch**

Run: `git status --short` — Expected: nothing. Run: `git log --oneline -3` and `ls tool/src/core/deno-tools.ts` — Expected: the file exists.
Run: `git checkout -b feat/oracle-checks`
If `deno-tools.ts` is missing, stop: Plan A is not merged.

---

### Task 1: SQL interpolation rules

**Files:**
- Create: `tool/src/rules/sql.ts`
- Modify: `tool/src/constants/rules.ts`, `tool/src/core/audit.ts`
- Test: `tool/test/sql-rules.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tool/test/sql-rules.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the build to verify it fails**

Run: `npm run build`
Expected: it compiles (the test only uses existing APIs) and the new file is built.
Run: `node --test dist/tool/test/sql-rules.test.js`
Expected: FAIL — tests 2, 3, 4 and 6 report `actual: []` instead of `SQL_…` entries (the rule does not exist yet); tests 1 and 5 pass trivially.

- [ ] **Step 3: Create the rule**

Create `tool/src/rules/sql.ts`:

```ts
import type * as ts from 'typescript';
import type { Compiler, Emit } from '../types/report.js';
import { access, memberName, unwrap } from './syntax.js';

const SQL_METHODS = new Set(['execute', 'executeMany', 'query', 'queryStream']);
// Static text must look like a statement; this keeps Hono's req.query("name") and similar calls out.
const SQL_SHAPE = /\b(?:SELECT|INSERT|UPDATE|DELETE|MERGE)\b[\s\S]*\b(?:FROM|INTO|SET|VALUES|USING)\b|\bBEGIN\b[\s\S]*\bEND\b/i;
const IDENTIFIER_POSITION = /\b(?:ORDER\s+BY|GROUP\s+BY|FROM|JOIN|INTO|UPDATE|TABLE)\s*$/i;
const MAX_DEPTH = 6;

type Part = { literal: string } | { expression: ts.Expression };

/**
 * Local evidence only: SQL text passed to execute/executeMany/query/queryStream that interpolates something
 * which is not a constant of the same file. It does not follow imports, wrappers or data flow, and it is not
 * proof of injection; bind variables cannot parameterize identifiers, so those get their own code.
 * shortcut: file-wide name table (shadowed names are dropped), exact scoping needs the type checker.
 */
export function inspectSql(source: ts.SourceFile, ts: Compiler, emit: Emit): void {
  const at = (node: ts.Node): number => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const declared = new Map<string, ts.Expression | null>();
  function collect(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const constant = ts.isVariableDeclarationList(node.parent) && !!(node.parent.flags & ts.NodeFlags.Const) && !!node.initializer;
      declared.set(node.name.text, constant && !declared.has(node.name.text) ? node.initializer! : null);
    } else if ((ts.isParameter(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
      declared.set(node.name.text, null);
    }
    ts.forEachChild(node, collect);
  }
  collect(source);

  function parts(expression: ts.Expression, out: Part[] = []): Part[] {
    expression = unwrap(expression, ts);
    if (ts.isStringLiteralLike(expression)) out.push({ literal: expression.text });
    else if (ts.isTemplateExpression(expression)) {
      out.push({ literal: expression.head.text });
      for (const span of expression.templateSpans) { out.push({ expression: span.expression }); out.push({ literal: span.literal.text }); }
    } else if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      parts(expression.left, out); parts(expression.right, out);
    } else out.push({ expression });
    return out;
  }
  function cleared(expression: ts.Expression, depth: number): boolean {
    expression = unwrap(expression, ts);
    if (ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression)) return true;
    if (ts.isTemplateExpression(expression)) return expression.templateSpans.every(span => cleared(span.expression, depth + 1));
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) return cleared(expression.left, depth + 1) && cleared(expression.right, depth + 1);
    if (ts.isIdentifier(expression) && depth < MAX_DEPTH) {
      const value = declared.get(expression.text);
      return !!value && cleared(value, depth + 1);
    }
    return false;
  }
  function sqlArgument(argument: ts.Expression): ts.Expression {
    argument = unwrap(argument, ts);
    if (ts.isObjectLiteralExpression(argument)) {
      const text = argument.properties.find(property => ts.isPropertyAssignment(property) && memberName(property.name, ts) === 'text');
      if (text && ts.isPropertyAssignment(text)) return unwrap(text.initializer, ts);
    }
    if (ts.isIdentifier(argument)) return declared.get(argument.text) ?? argument;
    return argument;
  }
  function walk(node: ts.Node): void {
    if (ts.isCallExpression(node) && node.arguments[0]) {
      const method = access(node.expression, ts);
      if (method && SQL_METHODS.has(method.name)) {
        const list = parts(sqlArgument(node.arguments[0]));
        const text = list.map(part => 'literal' in part ? part.literal : ' ').join('');
        if (list.some(part => 'expression' in part) && SQL_SHAPE.test(text)) {
          let before = '';
          for (const part of list) {
            if ('literal' in part) { before += part.literal; continue; }
            // :${n} and $${n} build a numbered bind placeholder, which cannot carry SQL.
            if (/[:$]$/.test(before) || cleared(part.expression, 0)) { before += ' '; continue; }
            const shown = part.expression.getText(source).replace(/\s+/g, ' ').slice(0, 40);
            if (IDENTIFIER_POSITION.test(before)) emit('SQL_DYNAMIC_IDENTIFIER', 'P2', at(part.expression), `SQL interpolates "${shown}" where an identifier or clause belongs; bind variables cannot protect it, so verify a fixed allowlist`);
            else emit('SQL_STRING_INTERPOLATION', 'P2', at(part.expression), `SQL interpolates the non-constant expression "${shown}"; pass values as bind variables or prove it is a fixed fragment`);
            before += ' ';
          }
        }
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
}
```

- [ ] **Step 4: Register the codes and wire the pass (CRLF-safe)**

Save this script **outside the repository** (for example in your temp directory as `patch-sql.cjs`; never commit it):

```js
const fs = require('fs');
const base = process.argv[2];
function edit(file, pairs) {
  const p = base + '/' + file;
  const raw = fs.readFileSync(p, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');
  for (const [from, to] of pairs) {
    if (!s.includes(from)) throw Error('missing in ' + file + ': ' + from);
    s = s.replace(from, to);
  }
  fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
edit('constants/rules.ts', [
  ["'DENO_AUDIT_ADVISORY',\n", "'DENO_AUDIT_ADVISORY',\n  'SQL_STRING_INTERPOLATION', 'SQL_DYNAMIC_IDENTIFIER',\n"],
]);
edit('core/audit.ts', [
  ["import { inspectFrameworks } from '../rules/frameworks.js';", "import { inspectFrameworks } from '../rules/frameworks.js';\nimport { inspectSql } from '../rules/sql.js';"],
  ["        inspectFrameworks(resolved?.source ?? source, ts, emit);\n", "        inspectFrameworks(resolved?.source ?? source, ts, emit);\n        inspectSql(resolved?.source ?? source, ts, emit);\n"],
]);
console.log('patched');
```

Run: `node <temp>/patch-sql.cjs tool/src`
Expected: prints `patched`; `git diff --stat` shows `tool/src/constants/rules.ts` and `tool/src/core/audit.ts` modified.

- [ ] **Step 5: Run the tests**

Run: `npm run build && node --test dist/tool/test/sql-rules.test.js`
Expected: PASS — `# pass 6`, `# fail 0`.

- [ ] **Step 6: Regression (one file at a time)**

Run each, separately: `node --test dist/tool/test/frameworks.test.js` (expect `# pass 5`), `node --test dist/tool/test/ts-rails-regression.test.js` (expect `# pass 45`), `node --test dist/tool/test/ts-rails-audit.test.js` (expect `# pass 1`).
Expected: `# fail 0` each. These are the suites that count findings on fixtures and could notice a new rule firing.

- [ ] **Step 7: Commit**

```bash
git add tool/src/rules/sql.ts tool/src/constants/rules.ts tool/src/core/audit.ts tool/test/sql-rules.test.ts
git commit -m "feat: report non-constant SQL interpolation and dynamic identifiers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Oracle doctor core

**Files:**
- Create: `tool/src/core/oracle-doctor.ts`
- Test: `tool/test/oracle-doctor.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tool/test/oracle-doctor.test.ts`:

```ts
import type { TestContext } from 'node:test';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clientVersion, compareVersions, oracleDoctor, parseVersion } from '../src/core/oracle-doctor.js';

function tree(t: TestContext, files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-doctor-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}
const thick = { 'src/db.ts': 'import oracledb from "oracledb";\noracledb.initOracleClient({ libDir: "x" });\n' };
const base = { minimum: '19.1', env: {} as NodeJS.ProcessEnv };

test('versions parse and compare numerically', () => {
  assert.deepEqual(parseVersion('19.21.0'), [19, 21, 0]);
  assert.equal(parseVersion('v19'), undefined);
  assert.ok(compareVersions([19, 1], [12, 2]) > 0);
  assert.ok(compareVersions([19], [19, 1]) < 0);
  assert.equal(compareVersions([19, 1, 0], [19, 1]), 0);
});
test('client version comes from the library suffix, the Instant Client directory or an Oracle home path only', () => {
  assert.deepEqual(clientVersion('/x/client', 'libclntsh.so.21.1'), { version: '21.1', evidence: 'library file name libclntsh.so.21.1' });
  assert.equal(clientVersion('C:\\oracle\\instantclient_19_21', 'oci.dll').version, '19.21');
  assert.deepEqual(clientVersion('C:\\Oracle\\product\\12.2.0\\client_64\\bin', 'oci.dll'), { version: '12.2.0', evidence: 'Oracle home path C:\\Oracle\\product\\12.2.0\\client_64\\bin' });
  assert.equal(clientVersion('/x/client', 'oci.dll').version, undefined);
});

test('a recent client is OK and the driver mode is thick with evidence', t => {
  const root = tree(t, { ...thick, 'client/instantclient_19_21/oci.dll': '' });
  const report = oracleDoctor({ ...base, root, platform: 'win32', clientDir: path.join(root, 'client/instantclient_19_21') });
  assert.equal(report.status, 'OK');
  assert.deepEqual(report.mode, { value: 'thick', evidence: [{ file: 'src/db.ts', line: 2 }] });
  assert.equal(report.client?.version, '19.21');
  assert.equal(report.client?.origin, '--client-dir');
});
test('an old client is TOO_OLD', t => {
  const root = tree(t, { ...thick, 'c/instantclient_12_2/oci.dll': '' });
  assert.equal(oracleDoctor({ ...base, root, platform: 'win32', clientDir: path.join(root, 'c/instantclient_12_2') }).status, 'TOO_OLD');
});
test('the client is found through PATH on the platform library name', t => {
  const root = tree(t, { ...thick, 'bin/libclntsh.so.21.1': '' });
  const report = oracleDoctor({ ...base, root, platform: 'linux', env: { LD_LIBRARY_PATH: path.join(root, 'bin') } });
  assert.equal(report.status, 'OK');
  assert.equal(report.client?.origin, 'LD_LIBRARY_PATH');
});
test('an unversioned client directory is VERSION_UNKNOWN, never OK', t => {
  const root = tree(t, { ...thick, 'client/oci.dll': '' });
  const report = oracleDoctor({ ...base, root, platform: 'win32', clientDir: path.join(root, 'client') });
  assert.equal(report.status, 'VERSION_UNKNOWN');
});
test('no client is MISSING and a bad --client-dir is explained', t => {
  const root = tree(t, thick);
  const report = oracleDoctor({ ...base, root, platform: 'win32', clientDir: path.join(root, 'nope') });
  assert.equal(report.status, 'MISSING');
  assert.ok(report.notes.some(note => /not a readable directory/.test(note)));
});
test('thin mode needs no client', t => {
  const root = tree(t, { 'src/db.ts': 'import oracledb from "oracledb";\nexport const o = oracledb;\n' });
  const report = oracleDoctor({ ...base, root, platform: 'win32' });
  assert.equal(report.status, 'NOT_REQUIRED');
  assert.equal(report.mode.value, 'thin');
});
test('client libraries for another platform inside the project are listed', t => {
  const root = tree(t, { ...thick, 'libocci.so.21.1': '', 'node_modules/x/libocci.so.1': '' });
  assert.deepEqual(oracleDoctor({ ...base, root, platform: 'win32' }).foreignLibraries, [{ file: 'libocci.so.21.1', platform: 'linux' }]);
  assert.deepEqual(oracleDoctor({ ...base, root, platform: 'linux' }).foreignLibraries, []);
});
test('an invalid minimum is rejected', t => {
  assert.throws(() => oracleDoctor({ ...base, root: tree(t, thick), platform: 'linux', minimum: 'abc' }), /minimum/);
});
```

- [ ] **Step 2: Run the build to verify it fails**

Run: `npm run build`
Expected: FAIL with `error TS2307: Cannot find module '../src/core/oracle-doctor.js'`.

- [ ] **Step 3: Write the doctor**

Create `tool/src/core/oracle-doctor.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { EXCLUDED_DIRS } from '../constants/defaults.js';

export interface DoctorOptions { root: string; minimum: string; env: NodeJS.ProcessEnv; platform: NodeJS.Platform; clientDir?: string | undefined }
export interface ClientEvidence { dir: string; origin: string; library: string; version: string | undefined; versionEvidence: string }
export interface DoctorReport {
  schemaVersion: 1;
  status: 'OK' | 'TOO_OLD' | 'VERSION_UNKNOWN' | 'MISSING' | 'NOT_REQUIRED';
  mode: { value: 'thick' | 'thin'; evidence: { file: string; line: number }[] };
  minimum: string;
  client: ClientEvidence | undefined;
  foreignLibraries: { file: string; platform: string }[];
  notes: string[];
  disclaimer: string;
}

const DISCLAIMER = 'File metadata and source text only: no library is loaded and no connection is opened. Credentials, network reachability and privileges are not checked.';
const LIBRARY: Partial<Record<NodeJS.Platform, RegExp>> = {
  win32: /^oci\.dll$/i, linux: /^libclntsh\.so(?:\.\d+)*$/, darwin: /^libclntsh\.dylib(?:\.\d+)*$/,
};
const NATIVE_FILE = /^(?:libclntsh|libocci|libnnz|oci)[^/]*\.(so(?:\.\d+)*|dll|dylib)$/i;
const PLATFORM_OF: Record<string, string> = { so: 'linux', dll: 'win32', dylib: 'darwin' };

/** Parses "19", "19.1" or "19.21.0" into comparable numbers; undefined when it is not a version. */
export function parseVersion(text: string): number[] | undefined {
  return /^\d+(?:\.\d+)*$/.test(text) ? text.split('.').map(Number) : undefined;
}
export function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
}
/** Version from the library file suffix (libclntsh.so.19.1), the Instant Client directory name (instantclient_19_21) or an Oracle home path (.../product/12.2.0/client_64/bin). */
export function clientVersion(dir: string, library: string): { version: string | undefined; evidence: string } {
  const suffix = /\.(?:so|dylib)\.(\d+(?:\.\d+)*)$/.exec(library)?.[1];
  if (suffix) return { version: suffix, evidence: 'library file name ' + library };
  const folder = /instantclient[_-](\d+)[_-](\d+)/i.exec(path.basename(dir));
  if (folder) return { version: folder[1] + '.' + folder[2], evidence: 'directory name ' + path.basename(dir) };
  const home = /[\\/]product[\\/](\d+(?:\.\d+)*)[\\/]/i.exec(dir)?.[1];
  if (home) return { version: home, evidence: 'Oracle home path ' + dir };
  return { version: undefined, evidence: 'no version in the file name, directory name or Oracle home path' };
}
function findClient(options: DoctorOptions, notes: string[]): ClientEvidence | undefined {
  const pattern = LIBRARY[options.platform];
  if (!pattern) { notes.push('Unsupported platform for client discovery: ' + options.platform); return undefined; }
  const candidates: [string, string][] = [];
  if (options.clientDir) candidates.push([options.clientDir, '--client-dir']);
  if (options.env['ORACLE_CLIENT_LIB_DIR']) candidates.push([options.env['ORACLE_CLIENT_LIB_DIR'], 'ORACLE_CLIENT_LIB_DIR']);
  for (const name of ['PATH', 'LD_LIBRARY_PATH', 'DYLD_LIBRARY_PATH']) {
    for (const dir of (options.env[name] ?? '').split(path.delimiter)) if (dir) candidates.push([dir, name]);
  }
  for (const [dir, origin] of candidates) {
    let names: string[];
    try { names = fs.readdirSync(dir); } catch { if (origin !== 'PATH') notes.push(origin + ' is not a readable directory: ' + dir); continue; }
    const library = names.find(name => pattern.test(name));
    if (!library) { if (origin === '--client-dir' || origin === 'ORACLE_CLIENT_LIB_DIR') notes.push(origin + ' has no Oracle client library: ' + dir); continue; }
    const found = clientVersion(dir, library);
    return { dir, origin, library, version: found.version, versionEvidence: found.evidence };
  }
  return undefined;
}
function sourceFiles(root: string, found: string[] = [], foreign: string[] = [], depth = 0): { sources: string[]; natives: string[] } {
  if (depth > 6) return { sources: found, natives: foreign };
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) { if (!EXCLUDED_DIRS.has(entry.name)) sourceFiles(file, found, foreign, depth + 1); }
    else if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) found.push(file);
    else if (NATIVE_FILE.test(entry.name)) foreign.push(file);
  }
  return { sources: found, natives: foreign };
}

export function oracleDoctor(options: DoctorOptions): DoctorReport {
  const minimum = parseVersion(options.minimum);
  if (!minimum) throw Error('minimum must look like 19 or 19.1');
  const root = fs.realpathSync.native(path.resolve(options.root));
  const notes: string[] = [];
  const { sources, natives } = sourceFiles(root);
  const evidence: { file: string; line: number }[] = [];
  for (const file of sources) {
    if (fs.statSync(file).size > 2 * 1024 * 1024) continue;
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((text, index) => {
      if (/\binitOracleClient\s*\(|\.thin\s*=\s*false\b/.test(text)) evidence.push({ file: path.relative(root, file).replaceAll('\\', '/'), line: index + 1 });
    });
  }
  const mode = evidence.length ? 'thick' : 'thin';
  const foreignLibraries = natives.map(file => ({ file: path.relative(root, file).replaceAll('\\', '/'), platform: PLATFORM_OF[(/\.(so|dll|dylib)(?:\.\d+)*$/i.exec(file)?.[1] ?? '').toLowerCase()] ?? 'unknown' }))
    .filter(item => item.platform !== options.platform).sort((a, b) => a.file.localeCompare(b.file));
  const client = findClient(options, notes);
  let status: DoctorReport['status'];
  if (mode === 'thin') status = 'NOT_REQUIRED';
  else if (!client) status = 'MISSING';
  else {
    const version = client.version ? parseVersion(client.version) : undefined;
    status = !version ? 'VERSION_UNKNOWN' : compareVersions(version, minimum) < 0 ? 'TOO_OLD' : 'OK';
  }
  return { schemaVersion: 1, status, mode: { value: mode, evidence }, minimum: options.minimum, client, foreignLibraries, notes, disclaimer: DISCLAIMER };
}
export function doctorText(report: DoctorReport): string {
  const lines = [`${report.status}: driver mode ${report.mode.value}${report.mode.evidence.length ? ' (' + report.mode.evidence.map(e => e.file + ':' + e.line).join(', ') + ')' : ' (no initOracleClient call found; thin is the driver default)'}`];
  lines.push(report.client ? `Client ${report.client.version ?? 'version unknown'} at ${report.client.dir} (from ${report.client.origin}; ${report.client.versionEvidence}); required minimum ${report.minimum}` : `No Oracle client library found; required minimum ${report.minimum}`);
  for (const item of report.foreignLibraries) lines.push(`Native library for ${item.platform} in the project tree: ${item.file} (intended for another platform or a container? it is not used on this one)`);
  for (const note of report.notes) lines.push('Note: ' + note);
  lines.push(report.disclaimer);
  return lines.join('\n');
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run build && node --test dist/tool/test/oracle-doctor.test.js`
Expected: PASS — `# pass 10`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add tool/src/core/oracle-doctor.ts tool/test/oracle-doctor.test.ts
git commit -m "feat: add Oracle client preflight core (metadata only)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `doctor oracle` command

**Files:**
- Create: `tool/src/doctor-cli.ts`
- Modify: `tool/src/cli.ts`
- Test: `tool/test/oracle-doctor-cli.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tool/test/oracle-doctor-cli.test.ts`:

```ts
import type { TestContext } from 'node:test';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../src/cli.js';

function tree(t: TestContext, files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-doctor-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

test('doctor CLI exit codes: 0 OK, 2 too old, 1 usage', t => {
  // Every platform's library name is present so the test does not depend on the host OS.
  const libraries = ['oci.dll', 'libclntsh.so.19.1', 'libclntsh.dylib.19.1'];
  const files: Record<string, string> = { 'src/db.ts': 'import oracledb from "oracledb";\noracledb.initOracleClient({ libDir: "x" });\n' };
  for (const dir of ['c/instantclient_19_21', 'c/instantclient_12_2']) for (const library of libraries) files[`${dir}/${library}`] = '';
  const root = tree(t, files);
  const common = ['doctor', 'oracle', '--root', root, '--format', 'json'];
  assert.equal(main([...common, '--client-dir', path.join(root, 'c/instantclient_19_21')]), 0);
  assert.equal(main([...common, '--client-dir', path.join(root, 'c/instantclient_12_2')]), 2);
  assert.equal(main(['doctor']), 1);
  assert.equal(main(['doctor', 'oracle', '--wat']), 1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run build && node --test dist/tool/test/oracle-doctor-cli.test.js`
Expected: FAIL — `main(['doctor'])` returns `1` only by accident of "Unknown argument"; the exit-0 and exit-2 assertions fail (`1 !== 0`) because `doctor` is not a command yet.

- [ ] **Step 3: Create the command module**

Create `tool/src/doctor-cli.ts`:

```ts
import { message } from './core/compiler.js';
import { doctorText, oracleDoctor } from './core/oracle-doctor.js';

const USAGE = 'Usage: node scripts/ts-rails-audit.cjs doctor oracle [--root DIR] [--client-dir DIR] [--min-client MAJOR[.MINOR]] [--format text|json]';
/** Exit 0 OK/NOT_REQUIRED, 1 usage error or unknown client version, 2 client missing or too old. */
export function doctorMain(args: string[]): number {
  try {
    if (args[0] !== 'oracle') throw Error(USAGE);
    let root = '.', format = 'text', minimum = '19.1', clientDir: string | undefined;
    const value = (i: number): string => {
      const result = args[i];
      if (!result || result.startsWith('--')) throw Error('Missing value for ' + args[i - 1]);
      return result;
    };
    for (let i = 1; i < args.length; i++) {
      switch (args[i]) {
        case '--root': root = value(++i); break;
        case '--client-dir': clientDir = value(++i); break;
        case '--min-client': minimum = value(++i); break;
        case '--format': format = value(++i); break;
        default: throw Error('Unknown argument ' + args[i] + '\n' + USAGE);
      }
    }
    if (format !== 'text' && format !== 'json') throw Error('Invalid format: ' + format);
    const report = oracleDoctor({ root, minimum, clientDir, env: process.env, platform: process.platform });
    console.log(format === 'json' ? JSON.stringify(report, null, 2) : doctorText(report));
    return report.status === 'OK' || report.status === 'NOT_REQUIRED' ? 0 : report.status === 'VERSION_UNKNOWN' ? 1 : 2;
  } catch (error) { console.error(message(error)); return 1; }
}
```

- [ ] **Step 4: Dispatch it from the CLI (CRLF-safe)**

Save outside the repository as `patch-doctor.cjs`:

```js
const fs = require('fs');
const base = process.argv[2];
function edit(file, pairs) {
  const p = base + '/' + file;
  const raw = fs.readFileSync(p, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');
  for (const [from, to] of pairs) {
    if (!s.includes(from)) throw Error('missing in ' + file + ': ' + from);
    s = s.replace(from, to);
  }
  fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
edit('cli.ts', [
  ["import { sarif } from './reporters/sarif.js';", "import { sarif } from './reporters/sarif.js';\nimport { doctorMain } from './doctor-cli.js';"],
  ["export function main(args: string[] = process.argv.slice(2)): number {\n", "export function main(args: string[] = process.argv.slice(2)): number {\n  if (args[0] === 'doctor') return doctorMain(args.slice(1));\n"],
  ["'Usage: node scripts/ts-rails-audit.cjs --root DIR", "'Usage: node scripts/ts-rails-audit.cjs doctor oracle [--root DIR] [--client-dir DIR] [--min-client MAJOR[.MINOR]] [--format text|json]\\n       node scripts/ts-rails-audit.cjs --root DIR"],
]);
console.log('patched');
```

Run: `node <temp>/patch-doctor.cjs tool/src`
Expected: prints `patched`; `tool/src/cli.ts` is modified.

- [ ] **Step 5: Run the tests**

Run: `npm run build && node --test dist/tool/test/oracle-doctor-cli.test.js`
Expected: PASS — `# pass 1`, `# fail 0` (the test prints two JSON reports to stdout; that is expected).
Run: `node --test dist/tool/test/ts-rails-cli.test.js` — Expected: `# pass 11`, `# fail 0` (existing CLI behaviour intact).

- [ ] **Step 6: Commit**

```bash
git add tool/src/doctor-cli.ts tool/src/cli.ts tool/test/oracle-doctor-cli.test.ts
git commit -m "feat: add doctor oracle command

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reference and rails

**Files:**
- Create: `references/oracle.md`
- Modify: `references/scanner.md`, `SKILL.md`

- [ ] **Step 1: Create the Oracle reference**

Create `references/oracle.md`:

````markdown
# Oracle profile

Load when `oracledb` is a dependency (manifest, `deno.json` imports or imports in source). Combine with [PostgreSQL](postgresql.md) only when both databases are really used, and with [Deno](runtime-deno.md) when the runtime is Deno. Never run anything against a production database to inspect this profile; the auditor and `doctor` never connect.

## Driver mode and client

The driver runs in thin mode by default; thick mode needs Oracle Client libraries and an explicit `initOracleClient` call (or a project setting that makes it). Establish which mode the project really uses before judging environment problems. The minimum client version is a property of the resolved driver version (R0a): read the installation documentation of the exact version in the lockfile. A reference run with `oracledb` 7.0.1 rejected a 12.2 client with `DPI-1050` and asked for 19.1 or higher, so `doctor` defaults to 19.1 and accepts `--min-client`.

```sh
node scripts/ts-rails-audit.cjs doctor oracle --root TARGET [--client-dir DIR] [--min-client 19.1]
```

It reads file names, directory names and source text only: the client library found through `--client-dir`, `ORACLE_CLIENT_LIB_DIR`, `PATH`, `LD_LIBRARY_PATH` or `DYLD_LIBRARY_PATH`; its version from the library suffix, an `instantclient_X_Y` directory or an Oracle home path (otherwise `VERSION_UNKNOWN`); the driver mode from `initOracleClient`/`thin = false` evidence; and native client libraries inside the project tree that belong to another platform. It loads no library and opens no connection, so credentials, network reachability, privileges and the real loaded version are not checked. Exit 0 OK or not required, 1 usage error or unknown version, 2 missing or too old.

Deno: loading the thick binary needs `--allow-ffi`; `NJS-045` can mean the permission or the client is missing, so read the whole message. Client libraries are platform specific; a `.so` file in a Windows checkout is meant for a container or Lambda image, not for that machine.

## SQL

Pass values as bind variables (`:name`, `:1`). Bind variables cannot parameterize identifiers or clauses (`ORDER BY`, table or column names): use a fixed allowlist of complete fragments, never request text. Numbered placeholders built as `` :${n} `` are safe because the substitution is only a position.

The auditor reports local evidence only, on `execute`, `executeMany`, `query` and `queryStream` calls whose static text looks like a statement:

- `SQL_STRING_INTERPOLATION`: a substitution or concatenated operand that is not a constant of the same file.
- `SQL_DYNAMIC_IDENTIFIER`: the same where an identifier or clause belongs (after `ORDER BY`, `GROUP BY`, `FROM`, `JOIN`, `INTO`, `UPDATE`, `TABLE`).

Constants are cleared through `const` bindings in the file; parameters, imports, calls and shadowed names are leads. A lead is cleared by reading every caller: a helper that only receives string literals is safe, one that forwards request data is not. Neither rule follows imports, wrappers or data flow, and neither proves injection.

## Connections, cursors and transactions

Review that every acquired connection is released and every cursor closed in `finally`, and that a failing close does not skip the remaining ones. A pool has one owner, warm-up and shutdown policy, and timeouts for connect and calls. Check `autoCommit` where a helper sets it (the driver default is not to commit; verify for the resolved version), that a failed rollback is reported as an unknown outcome and not as a rollback, and that row locks are taken inside the transaction that uses them.

## Tests

Prefer doubles for unit tests and a disposable database for integration tests. A test that imports a module reaching the driver does not necessarily need the native client: in the reference run ten test files reached `oracledb` through static imports, and only the file whose code initialised thick mode failed without a client. Decide by running the test with the client absent, not by import graphs.
````

- [ ] **Step 2: Add the rule section to `references/scanner.md`**

Append at the end of the file:

````markdown

## SQL interpolation rules

`SQL_STRING_INTERPOLATION` and `SQL_DYNAMIC_IDENTIFIER` (P2, heuristic) inspect `execute`, `executeMany`, `query` and `queryStream` calls, whatever the receiver, whose static text looks like a SQL statement and which interpolate or concatenate something that is not a constant of the same file. Numbered placeholders (`` :${n} ``, `` $${n} ``), string/number literals and same-file `const` fragments are cleared; parameters, imports, calls and shadowed names are leads. They do not follow imports, wrappers or call sites and do not prove injection. A request-controlled value in a clause position is the case to review first. See [Oracle](oracle.md) for the Oracle context and the `doctor oracle` environment preflight (`node scripts/ts-rails-audit.cjs doctor oracle --root TARGET`).
````

- [ ] **Step 3: Register the reference and the rail sentence (CRLF-safe)**

Save outside the repository as `patch-docs.cjs`:

```js
const fs = require('fs');
function edit(file, pairs) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');
  for (const [from, to] of pairs) {
    if (!s.includes(from)) throw Error('missing in ' + file + ': ' + from);
    s = s.replace(from, to);
  }
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
}
edit('SKILL.md', [
  ['- `references/timescaledb.md`:', '- `references/oracle.md`: Oracle driver mode and client, bind variables and dynamic SQL, cursors and transactions, test hermeticity; activate when `oracledb` is actually used.\n- `references/timescaledb.md`:'],
  ['the auditor never connects to a database or infers all dynamic policies.', 'the auditor never connects to a database or infers all dynamic policies. SQL text interpolates only constants or a fixed allowlist, never request data (see the `SQL_*` leads in `references/scanner.md`).'],
]);
console.log('patched');
```

Run: `node <temp>/patch-docs.cjs` from the repository root.
Expected: prints `patched`; `git diff --stat` shows `SKILL.md` modified.

- [ ] **Step 4: Check the edits**

Run: `git diff --stat references SKILL.md`
Expected: `SKILL.md` (2 lines changed), `references/scanner.md` (about 6 added), and `references/oracle.md` untracked. No test reads these files.

- [ ] **Step 5: Commit**

```bash
git add references/oracle.md references/scanner.md SKILL.md
git commit -m "docs: add Oracle profile, SQL rules and doctor reference

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Acceptance on a real Oracle project (read-only)

**Files:**
- Create: `docs/verification/2026-11-17-oracle-checks.md`

- [ ] **Step 1: Snapshot the target outside the repository, without `.env`**

Run (replace `TARGET` and the empty directory `SNAP`, both outside this repository):

```bash
git -C TARGET status --short            # must print nothing
git -C TARGET archive HEAD | tar -x -C SNAP
```

Expected: `SNAP` has the sources and no `.env`, certificates or `node_modules`.

- [ ] **Step 2: Run the rules and the doctor**

Run: `node scripts/ts-rails-audit.cjs --root SNAP --format json > SNAP-report.json`
Run: `node scripts/ts-rails-audit.cjs doctor oracle --root SNAP`
Expected: the JSON `results` contain only `SQL_STRING_INTERPOLATION` / `SQL_DYNAMIC_IDENTIFIER` for files that really build SQL from non-constants; the doctor prints the mode, the client it found and its version (or `VERSION_UNKNOWN` when nothing identifies it), and exits 0, 1 or 2 as documented.

- [ ] **Step 3: Verify each finding by reading the file**

For every `SQL_*` finding open the file and read every caller of the enclosing function: classify each as cleared (all callers pass literals/constants) or a real injection path. For the doctor compare `status` with the machine's actual failure, if the project's tests were already run (`DPI-1050` for an old client, `NJS-045` for missing permission or library).

Reference run (2026-11-17): 3 findings in 1 file, all cleared; doctor `TOO_OLD` (client 12.2.0, minimum 19.1) matching the real `DPI-1050` failure; 2 foreign-platform libraries listed.

- [ ] **Step 4: Confirm the target tree is untouched**

Run: `git -C TARGET status --short` — Expected: nothing.

- [ ] **Step 5: Record the evidence**

Create `docs/verification/2026-11-17-oracle-checks.md` with the numbers from Step 3 (counts and categories only: no private file names, paths or content), Node and OS versions, the commands, the measured precision of the dropped `ORACLE_TEST_NOT_HERMETIC` idea (10 files reached the driver statically, 1 failed without a client), and the limits: leads are not proof; the rule does not follow imports or call sites; `doctor` reads names and text only and cannot confirm the loaded client version, credentials or reachability; only Windows was exercised.

- [ ] **Step 6: Commit**

```bash
git add docs/verification/2026-11-17-oracle-checks.md
git commit -m "docs: record Oracle checks acceptance run

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Bounded verification and hand-off

**Files:** none.

- [ ] **Step 1: Strict type check and the targeted suites, one at a time**

Run: `npx tsc --noEmit` — Expected: no output.
Run separately, each with `timeout 150`: `sql-rules` (6), `oracle-doctor` (10), `oracle-doctor-cli` (1), `frameworks` (5), `ts-rails-regression` (45), `ts-rails-cli` (11), `architecture` (20), `deno-output` (5), `deno-integrations` (9; needs Deno 2.9.8 and may skip the network test).
Expected: `# fail 0` for every file.

- [ ] **Step 2: Hand off**

Run: `git status --short` — Expected: nothing. Report the commits, the counts above, and what was **not** run: the full `npm run verify`, the corpus and runtime-project tests, the `reporting` symlink tests, and any platform other than Windows. Leave the branch for the owner to merge; do not push.

---

## Self-review

**Spec coverage (section 2).** `SQL_STRING_INTERPOLATION` with clearing of constants, placeholders and allowlists → Task 1 (the "frozen map" clearing is not implemented; the allowlist case stays a lead and is documented). Dynamic `ORDER BY`/identifier as its own code → `SQL_DYNAMIC_IDENTIFIER`. `ORACLE_TEST_NOT_HERMETIC` → intentionally dropped with measured evidence. `doctor` preflight (client version vs required, thick/thin, platform mismatch, metadata only) → Tasks 2–3. `references/oracle.md` and SKILL.md registration → Task 4. Verification plan items (constant fragment, `:${n}` placeholder, dynamic identifier fixtures; audited tree unchanged; no `.env`) → tests plus Task 5.

**Placeholder scan.** No TBD/TODO; every code step has the full file; existing files change only through complete scripts.

**Type consistency.** `DoctorOptions`/`DoctorReport`/`ClientEvidence` (Task 2) are the types consumed by `doctor-cli.ts` (Task 3); `inspectSql(source, ts, emit)` matches the signature of `inspectFrameworks`; the codes in `RULE_CODES` equal those emitted by `sql.ts`.

**Known limits.** Version discovery is by names and paths, not by the binary; the minimum is an observed default; the SQL rules are file-local; `doctor` was exercised on Windows only.
