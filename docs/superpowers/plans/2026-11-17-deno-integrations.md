# Deno-native integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the auditor run the Deno project's own tools (`deno check`, `deno lint`, `deno info`, `deno audit`) from a read-only snapshot and report their evidence as `DENO_*` findings, so a Deno backend gets type errors, dependency advisories and unreachable files that the syntax rules cannot see.

**Architecture:** Four new `--integration` names (`deno-check`, `deno-lint`, `deno-graph`, `deno-audit`) reuse the existing snapshot-and-spawn pattern of `external-tools.ts`. Pure parsers (`deno-output.ts`) turn Deno's text/JSON output into typed records and fail closed on any unexpected shape; `deno-tools.ts` owns the snapshot, process execution and finding emission. The audited tree is never written, `.env` is never copied, and any tool failure makes the report `INCOMPLETE` instead of clean.

**Tech Stack:** TypeScript 6.0.3 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Node ≥22.13 `node:test`, Deno 2.9.8 on `PATH` for the integration tests.

**Spec:** `docs/superpowers/specs/2026-11-17-deno-oracle-integrations-design.md`

---

## Scope and decisions

This is **Plan A of three** (the spec covers independent subsystems):

| Plan | Content | Status |
| --- | --- | --- |
| **A (this file)** | `deno-check`, `deno-lint`, `deno-graph`, `deno-audit`, docs | ready |
| B | Oracle static rules (`SQL_STRING_INTERPOLATION`, `ORACLE_TEST_NOT_HERMETIC`), `doctor` preflight, `references/oracle.md` | write after A ships |
| C | Opt-in `deno-test` (needs a permission/hermeticity policy) | write after A ships |

Spec decisions, resolved here with the conservative default (change them before executing if you disagree):

1. **Confidence value:** reuse `'HEURISTIC'`; no schema change. The `DENO_*` code prefix and the `integrations` entry identify the source. Revisit if consumers need to separate "pattern" from "tool failed".
2. **`deno-audit` network use:** it only runs when the user passes `--integration deno-audit`, so the opt-in is the explicit flag. The docs must say it sends package names and versions to the Deno advisory service.
3. **`deno-test`:** excluded from this plan.
4. **Oracle `doctor`:** Plan B.

Facts established by running Deno 2.9.8 (the parsers and tests depend on them):

- `deno check` and `deno lint` with **no arguments** cover every file in the working directory; both exit 1 on findings. `deno check` writes errors to **stderr**; `deno lint --json` writes JSON to **stdout**.
- `deno check` prints `TSxxxx [ERROR]: message`, source context, then `    at file:///…/file.ts:LINE:COL`.
- `deno info --json ENTRY` returns `modules[]` (`specifier`, `kind`) and `npmPackages`; `npmPackages` lists the whole project, so reachability must come from `modules[]` entries of kind `npm` plus their `dependencies`.
- `deno audit` has **no `--json`**; it prints boxes (`╭ Title`, `│ Severity:`, `│ Package:`, `│ Vulnerable:`, `╰ Info:`), then `Found N vulnerabilities`, and the summary line `Severity: 0 low, …` can follow a warning box. Exit 1 when advisories exist.
- **`deno audit` without `deno.lock` prints "No known vulnerabilities found"** because nothing is resolved. That is a false clean result, so the integration refuses to run without a lockfile.
- On Windows Deno prints long paths in file URLs; the snapshot directory must be `realpath`-ed or `path.relative` fails on 8.3 aliases.
- The repository working tree uses CRLF line endings; edits to existing files below use a CRLF-safe script, not hand-typed multi-line replacements.

These steps were verified in a scratch copy of the repository before this plan was written: the new files compile under the repository's strict `tsconfig.json`, the 14 new tests pass, and a run of all four integrations over a snapshot of a real private Deno backend reproduced the manual findings (see Task 3).

## File structure

| File | Responsibility |
| --- | --- |
| Create `tool/src/constants/integrations.ts` | Single list of integration names, `isIntegration`, `isDenoIntegration` |
| Create `tool/src/core/deno-output.ts` | Pure parsers: `parseCheck`, `parseLint`, `parseInfo`, `parseAudit` |
| Create `tool/src/core/deno-tools.ts` | Snapshot, bounded process execution, entrypoints, graph, handlers, report integration |
| Modify `tool/src/types/report.ts` | `DenoIntegration`, `IntegrationName`, `AuditOptions.integrations` |
| Modify `tool/src/constants/rules.ts` | Four new rule codes (so `rules` config can disable them) |
| Modify `tool/src/core/config.ts` | Validate integrations with `isIntegration` |
| Modify `tool/src/cli.ts` | Accept all names; help text from the constant |
| Modify `tool/src/core/external-tools.ts` | Dispatch Deno names to `denoTools`; knip/cruiser path unchanged |
| Create `tool/test/deno-output.test.ts` | Parser tests (no Deno needed) |
| Create `tool/test/deno-integrations.test.ts` | End-to-end tests with a real Deno (skipped when absent) |
| Modify `references/scanner.md`, `references/runtime-deno.md`, `SKILL.md` | Document usage and limits |
| Create `docs/verification/2026-11-17-deno-integrations.md` | Recorded evidence |
| Regenerate `scripts/ts-rails-audit.cjs` | Built artifact the CLI tests execute |

Working directory for every command: the repository root (`C:\Desarrollo\typescript-engineering-guardrails`). Deno must be on `PATH` (`deno --version` → 2.9.8).

---

### Task 1: Pure Deno output parsers

**Files:**
- Create: `tool/src/core/deno-output.ts`
- Test: `tool/test/deno-output.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tool/test/deno-output.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the build to verify it fails**

Run: `npm run build`
Expected: FAIL with `error TS2307: Cannot find module '../src/core/deno-output.js'`.

- [ ] **Step 3: Write the parsers**

Create `tool/src/core/deno-output.ts`:

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Parsers are pinned to the output formats of Deno 2.9.8 and fail closed on any other shape.
export interface ParsedDiagnostic { code: string; file: string; line: number; message: string }
export interface ParsedAdvisory { title: string; severity: string; name: string; vulnerable: string; url: string }
export interface DenoGraph { files: Set<string>; packages: Set<string> }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Snapshot-relative POSIX path for a file URL; callers drop anything outside the snapshot. */
function relativeUrl(snapshot: string, url: string): string {
  return path.relative(snapshot, fileURLToPath(url)).replaceAll('\\', '/');
}

export function parseCheck(output: string, snapshot: string): ParsedDiagnostic[] {
  const lines = output.split(/\r?\n/);
  const found: ParsedDiagnostic[] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = /^(TS\d+) \[ERROR\]: (.*)$/.exec(lines[i] ?? '');
    if (!head) continue;
    for (let j = i + 1; j < lines.length && !/^TS\d+ \[ERROR\]/.test(lines[j] ?? ''); j++) {
      const at = /^\s+at (file:\/\/\S+?):(\d+):\d+\s*$/.exec(lines[j] ?? '');
      if (at) {
        found.push({ code: head[1] ?? '', message: head[2] ?? '', file: relativeUrl(snapshot, at[1] ?? ''), line: Number(at[2]) });
        break;
      }
    }
  }
  return found;
}

export function parseLint(json: string, snapshot: string): ParsedDiagnostic[] {
  const data: unknown = JSON.parse(json);
  if (!record(data) || !Array.isArray(data['diagnostics']) || !Array.isArray(data['errors'])) throw Error('Unexpected deno lint JSON shape');
  if (data['errors'].length) throw Error('deno lint reported errors: ' + JSON.stringify(data['errors']).slice(0, 300));
  return data['diagnostics'].map((item: unknown): ParsedDiagnostic => {
    const range = record(item) ? item['range'] : undefined;
    const start = record(range) ? range['start'] : undefined;
    if (!record(item) || typeof item['filename'] !== 'string' || typeof item['code'] !== 'string' || typeof item['message'] !== 'string' || !record(start) || typeof start['line'] !== 'number') throw Error('Unexpected deno lint diagnostic shape');
    return { code: item['code'], message: item['message'], file: relativeUrl(snapshot, item['filename']), line: start['line'] };
  });
}

export function parseInfo(json: string, snapshot: string): DenoGraph {
  const data: unknown = JSON.parse(json);
  if (!record(data) || !Array.isArray(data['modules'])) throw Error('Unexpected deno info JSON shape');
  const catalog = record(data['npmPackages']) ? data['npmPackages'] : {};
  const files = new Set<string>(), direct = new Set<string>();
  for (const module of data['modules'] as unknown[]) {
    if (!record(module) || typeof module['specifier'] !== 'string') throw Error('Unexpected deno info module shape');
    const specifier = module['specifier'];
    if (specifier.startsWith('file://')) files.add(relativeUrl(snapshot, specifier));
    const npm = /^npm:\/((?:@[^/@]+\/)?[^/@]+)@([^/_]+)/.exec(specifier);
    if (npm) direct.add(npm[1] + '@' + npm[2]);
  }
  const packages = new Set<string>(), seen = new Set<string>(), queue = [...direct];
  for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = catalog[key];
    packages.add(record(entry) && typeof entry['name'] === 'string' ? entry['name'] : key.slice(0, key.lastIndexOf('@')));
    if (record(entry) && Array.isArray(entry['dependencies'])) for (const dependency of entry['dependencies'] as unknown[]) if (typeof dependency === 'string') queue.push(dependency);
  }
  return { files, packages };
}

export function parseAudit(text: string): ParsedAdvisory[] {
  if (/No known vulnerabilities found/.test(text)) return [];
  const advisories: ParsedAdvisory[] = [];
  for (const block of text.split(/^╭ /m).slice(1)) {
    // Anchored to box lines: the trailing "Severity: 0 low, ..." summary can follow a warning box.
    const field = (label: string): string | undefined => new RegExp('^[│╰]\\s*' + label + ':\\s+(.+)$', 'm').exec(block)?.[1]?.trim();
    const severity = field('Severity');
    if (!severity) continue; // non-advisory boxes such as deprecation warnings
    const name = field('Package'), vulnerable = field('Vulnerable'), url = field('Info');
    if (!name || !vulnerable || !url) throw Error('Unexpected deno audit advisory shape');
    advisories.push({ title: (block.split(/\r?\n/)[0] ?? '').trim(), severity, name, vulnerable, url });
  }
  const total = /Found (\d+) vulnerabilit/.exec(text);
  if (!total || Number(total[1]) !== advisories.length) throw Error('Unexpected deno audit output shape');
  return advisories;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run build && node --test dist/tool/test/deno-output.test.js`
Expected: PASS — `# pass 5`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add tool/src/core/deno-output.ts tool/test/deno-output.test.ts
git commit -m "feat: parse deno check, lint, info and audit output fail-closed

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Integration plumbing and the four handlers

**Files:**
- Create: `tool/src/constants/integrations.ts`, `tool/src/core/deno-tools.ts`
- Modify: `tool/src/types/report.ts`, `tool/src/constants/rules.ts`, `tool/src/core/config.ts`, `tool/src/cli.ts`, `tool/src/core/external-tools.ts`
- Test: `tool/test/deno-integrations.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Create `tool/test/deno-integrations.test.ts`:

```ts
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
  process.env['PATH'] = os.tmpdir();
  const report = audit(root, getTS(), { integrations: ['deno-check'] });
  assert.equal(report.status, 'INCOMPLETE');
  assert.equal(report.integrations?.[0]?.version, 'UNAVAILABLE');
});
```

- [ ] **Step 2: Run the build to verify it fails**

Run: `npm run build`
Expected: FAIL with `error TS2322: Type '"deno-check"' is not assignable to type '"knip" | "dependency-cruiser"'` (and the same for `deno-lint`, `deno-graph`, `deno-audit`) in `tool/test/deno-integrations.test.ts`.

- [ ] **Step 3: Create the integration-name constants**

Create `tool/src/constants/integrations.ts`:

```ts
import type { DenoIntegration, IntegrationName } from '../types/report.js';
export const INTEGRATIONS: readonly IntegrationName[] = ['knip', 'dependency-cruiser', 'deno-check', 'deno-lint', 'deno-graph', 'deno-audit'];
export function isIntegration(value: unknown): value is IntegrationName {
  return INTEGRATIONS.includes(value as IntegrationName);
}
export function isDenoIntegration(name: IntegrationName): name is DenoIntegration {
  return name.startsWith('deno-');
}
```

- [ ] **Step 4: Create the Deno tools module**

Create `tool/src/core/deno-tools.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { SourceFile } from 'typescript';
import type { AuditReport, DenoIntegration, Severity } from '../types/report.js';
import { message } from './compiler.js';
import { inside, isTest, relative } from './project-discovery.js';
import { parseAudit, parseCheck, parseInfo, parseLint, type DenoGraph } from './deno-output.js';

interface Run { status: number; stdout: string; stderr: string }
type Graph = DenoGraph & { entries: string[] };
interface Context {
  dir: string; selected: Set<string>; graph: () => Graph;
  run: (args: string[], timeout: number) => Run;
  add: (code: string, severity: Severity, file: string, line: number, detail: string) => void;
}
const MAX_DATA_BYTES = 4 * 1024 * 1024;
// Rules already owned by EXPLICIT_ANY and NON_NULL_ASSERTION; repeating them would double count.
const COVERED_LINT = new Set(['no-explicit-any', 'no-non-null-assertion']);
const CONVENTIONAL_ENTRIES = ['main.ts', 'mod.ts', 'index.ts', 'server.ts', 'app.ts'].flatMap(name => [name, 'src/' + name]);

const tail = (text: string): string => text.trim().split(/\r?\n/).slice(-3).join(' | ');
function runDeno(args: string[], cwd: string, timeout: number): Run {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1', DENO_NO_UPDATE_CHECK: '1' };
  delete env['NODE_OPTIONS']; delete env['NODE_PATH'];
  const out = spawnSync('deno', args, { cwd, env, encoding: 'utf8', shell: false, timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  if (out.error || out.signal || out.status === null) throw Error('deno ' + (args[0] ?? '') + ' did not finish: ' + (out.error?.message ?? out.signal ?? 'no exit status'));
  return { status: out.status, stdout: out.stdout, stderr: out.stderr };
}
/** Copies a data file (never executed) into the snapshot after symlink, containment and size checks. */
function copyData(root: string, dir: string, name: string): boolean {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) return false;
  if (fs.lstatSync(file).isSymbolicLink() || !inside(root, fs.realpathSync(file)) || fs.statSync(file).size > MAX_DATA_BYTES) throw Error('Unsafe or oversized Deno data file: ' + name);
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  fs.copyFileSync(file, path.join(dir, name));
  return true;
}
function readJson(file: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; } // deno.jsonc comments: entrypoints then come only from conventions and tests
}
const strings = (value: unknown): string[] => typeof value === 'string' ? [value] :
  Array.isArray(value) ? value.flatMap(strings) : typeof value === 'object' && value !== null ? Object.values(value).flatMap(strings) : [];
function entrypoints(dir: string, selected: Set<string>): string[] {
  const entries = new Set(CONVENTIONAL_ENTRIES.filter(file => selected.has(file)));
  const config = fs.existsSync(path.join(dir, 'deno.json')) ? readJson(path.join(dir, 'deno.json')) : {};
  for (const text of [...strings(config['tasks']), ...strings(config['exports'])]) {
    for (const match of text.matchAll(/[\w@./-]+\.(?:m?ts|tsx)\b/g)) {
      const file = match[0].replace(/^\.\//, '');
      if (selected.has(file)) entries.add(file);
    }
  }
  for (const file of selected) if (isTest(file)) entries.add(file);
  return [...entries];
}

const HANDLERS: Record<DenoIntegration, (ctx: Context) => void> = {
  'deno-check'(ctx) {
    const result = ctx.run(['check'], 600000);
    if (result.status === 0) return;
    const diagnostics = parseCheck(result.stdout + '\n' + result.stderr, ctx.dir);
    if (!diagnostics.length) throw Error('deno check failed without type diagnostics: ' + tail(result.stderr));
    for (const d of diagnostics) ctx.add('DENO_TYPE_ERROR', 'P2', d.file, d.line, d.code + ': ' + d.message);
  },
  'deno-lint'(ctx) {
    const result = ctx.run(['lint', '--json'], 300000);
    if (result.status > 1) throw Error('deno lint failed: ' + tail(result.stderr));
    for (const d of parseLint(result.stdout, ctx.dir)) if (!COVERED_LINT.has(d.code)) ctx.add('DENO_LINT', 'P3', d.file, d.line, d.code + ': ' + d.message);
  },
  'deno-graph'(ctx) {
    const graph = ctx.graph();
    for (const file of [...ctx.selected].sort()) {
      if (!graph.files.has(file)) ctx.add('DENO_UNREACHABLE_FILE', 'P3', file, 1, 'Not imported by any of ' + graph.entries.length + ' detected entrypoints (tasks, main/mod/index/server/app, exports, tests); verify dynamic imports, scripts and deployment handlers before removal');
    }
  },
  'deno-audit'(ctx) {
    if (!fs.existsSync(path.join(ctx.dir, 'deno.lock'))) throw Error('deno audit needs deno.lock: without it nothing is resolved and Deno reports no vulnerabilities');
    const result = ctx.run(['audit'], 120000);
    if (result.status > 1) throw Error('deno audit failed: ' + tail(result.stderr));
    const advisories = parseAudit(result.stdout + '\n' + result.stderr);
    if (result.status === 1 && !advisories.length) throw Error('deno audit failed: ' + tail(result.stderr));
    let packages: Set<string> | string;
    try { packages = ctx.graph().packages; } catch (error) { packages = 'reachability unknown (' + message(error) + ')'; }
    for (const a of advisories) {
      const reach = typeof packages === 'string' ? packages : packages.has(a.name) ? 'reachable from entrypoints' : 'not in the entrypoint graph';
      ctx.add('DENO_AUDIT_ADVISORY', a.severity === 'high' || a.severity === 'critical' ? 'P2' : 'P3', 'deno.lock', 1, `${a.name} (${a.vulnerable}) ${a.severity}: ${a.title} — ${a.url}; ${reach}`);
    }
  },
};

export function denoTools(root: string, sources: Map<string, SourceFile>, names: DenoIntegration[], report: AuditReport): void {
  const log = (name: DenoIntegration, version: string, status: 'COMPLETE' | 'INCOMPLETE', findings: number): void => { (report.integrations ??= []).push({ name, version, status, findings }); };
  const probe = spawnSync('deno', ['--version'], { encoding: 'utf8', shell: false, timeout: 15000, windowsHide: true });
  if (probe.status !== 0) {
    for (const name of names) log(name, 'UNAVAILABLE', 'INCOMPLETE', 0);
    report.diagnostics.push({ code: 'EXTERNAL_TOOL_ERROR', file: '.', line: 1, message: 'deno: executable not available on PATH' });
    return;
  }
  const version = /^deno (\S+)/.exec(probe.stdout)?.[1] ?? 'unknown';
  let dir: string | undefined;
  try {
    // Realpath: file URLs printed by Deno use the long path, never a Windows 8.3 alias.
    dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'rails-deno-')));
    const snapshot = dir;
    const selected = new Set<string>();
    for (const [file, source] of sources) {
      const rel = relative(root, file); selected.add(rel);
      fs.mkdirSync(path.dirname(path.join(snapshot, rel)), { recursive: true });
      fs.writeFileSync(path.join(snapshot, rel), source.text);
    }
    const config = ['deno.json', 'deno.jsonc'].filter(name => copyData(root, snapshot, name));
    if (!config.length) throw Error('Deno integrations require deno.json or deno.jsonc at the root');
    copyData(root, snapshot, 'deno.lock');
    const importMap = readJson(path.join(snapshot, config[0] ?? ''))['importMap'];
    if (typeof importMap === 'string') {
      const rel = path.relative(root, path.resolve(root, importMap)).replaceAll('\\', '/');
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) copyData(root, snapshot, rel);
    }
    let graph: Graph | undefined;
    const ctx: Context = {
      dir: snapshot, selected,
      run: (args, timeout) => runDeno(args, snapshot, timeout),
      add: (code, severity, file, line, detail) => {
        const lock = file === 'deno.lock';
        if (!lock && !selected.has(file)) return;
        report.results.push({ code, severity, confidence: 'HEURISTIC', file, line, detail, scope: lock ? 'config' : isTest(file) ? 'test' : 'source' });
      },
      graph: () => {
        if (graph) return graph;
        const entries = entrypoints(snapshot, selected);
        if (!entries.length) throw Error('No Deno entrypoints detected (tasks, main/mod/index/server/app, exports or tests)');
        const built: Graph = { files: new Set(), packages: new Set(), entries };
        for (const entry of entries) {
          if (built.files.has(entry)) continue; // already traversed through an earlier entrypoint
          const result = runDeno(['info', '--json', entry], snapshot, 120000);
          if (result.status !== 0) throw Error('deno info failed for ' + entry + ': ' + tail(result.stderr));
          const part = parseInfo(result.stdout, snapshot);
          for (const file of part.files) built.files.add(file);
          for (const name of part.packages) built.packages.add(name);
        }
        return graph = built;
      },
    };
    for (const name of names) {
      const before = report.results.length;
      try {
        HANDLERS[name](ctx);
        log(name, version, 'COMPLETE', report.results.length - before);
      } catch (error) {
        report.results.splice(before);
        log(name, version, 'INCOMPLETE', 0);
        report.diagnostics.push({ code: 'EXTERNAL_TOOL_ERROR', file: '.', line: 1, message: name + ': ' + message(error) });
      }
    }
  } catch (error) { report.diagnostics.push({ code: 'EXTERNAL_SNAPSHOT_ERROR', file: '.', line: 1, message: message(error) }); }
  finally { if (dir) fs.rmSync(dir, { recursive: true, force: true }); }
}
```

- [ ] **Step 5: Patch the existing files (CRLF-safe)**

Save the following script **outside the repository** (for example `%TEMP%\patch-deno.cjs`; it is never committed). It edits five existing files, fails loudly if an anchor is missing, and preserves CRLF line endings.

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
edit('types/report.ts', [
  ["export interface Boundary", "export type DenoIntegration = 'deno-check' | 'deno-lint' | 'deno-graph' | 'deno-audit';\nexport type IntegrationName = 'knip' | 'dependency-cruiser' | DenoIntegration;\nexport interface Boundary"],
  ["integrations?: ('knip' | 'dependency-cruiser')[];", "integrations?: IntegrationName[];"],
]);
edit('constants/rules.ts', [
  ["'PG_POOL_TRANSACTION',\n", "'PG_POOL_TRANSACTION',\n  'DENO_TYPE_ERROR', 'DENO_LINT', 'DENO_UNREACHABLE_FILE', 'DENO_AUDIT_ADVISORY',\n"],
]);
edit('core/config.ts', [
  ["import { RULE_CODES } from '../constants/rules.js';", "import { RULE_CODES } from '../constants/rules.js';\nimport { isIntegration } from '../constants/integrations.js';"],
  ["value['integrations'].every(p => p === 'knip' || p === 'dependency-cruiser')", "value['integrations'].every(isIntegration)"],
]);
edit('cli.ts', [
  ["import { readConfig } from './core/config.js';", "import { readConfig } from './core/config.js';\nimport { INTEGRATIONS, isIntegration } from './constants/integrations.js';"],
  ["if (name !== 'knip' && name !== 'dependency-cruiser') throw Error", "if (!isIntegration(name)) throw Error"],
  ["[--integration knip|dependency-cruiser]", "[--integration ' + INTEGRATIONS.join('|') + ']"],
]);
edit('core/external-tools.ts', [
  ["import { inside, isTest, relative } from './project-discovery.js';", "import { inside, isTest, relative } from './project-discovery.js';\nimport { isDenoIntegration } from '../constants/integrations.js';\nimport { denoTools } from './deno-tools.js';"],
  ["  report.integrations = [];\n", "  report.integrations = [];\n  const deno = options.integrations.filter(isDenoIntegration);\n  if (deno.length) denoTools(root, sources, [...new Set(deno)], report);\n  const classic = options.integrations.filter((name): name is 'knip' | 'dependency-cruiser' => !isDenoIntegration(name));\n  if (!classic.length) return;\n"],
  ["for (const name of [...new Set(options.integrations)]) {", "for (const name of [...new Set(classic)]) {"],
]);
console.log('patched');
```

Run: `node %TEMP%\patch-deno.cjs tool/src` (PowerShell: `node $env:TEMP\patch-deno.cjs tool/src`)
Expected: prints `patched`. `git diff --stat` shows 5 modified files under `tool/src`.

What the script changes:
- `types/report.ts`: adds `DenoIntegration`, `IntegrationName`; `integrations?: IntegrationName[]`.
- `constants/rules.ts`: adds `DENO_TYPE_ERROR`, `DENO_LINT`, `DENO_UNREACHABLE_FILE`, `DENO_AUDIT_ADVISORY` to `RULE_CODES`.
- `core/config.ts`: `integrations` validated with `isIntegration`.
- `cli.ts`: `--integration` accepts every name; the help text lists `INTEGRATIONS`.
- `core/external-tools.ts`: Deno names go to `denoTools`; only knip/dependency-cruiser continue into the existing snapshot code, which is otherwise untouched.

- [ ] **Step 6: Run the new tests**

Run: `npm run build && node --test dist/tool/test/deno-output.test.js dist/tool/test/deno-integrations.test.js`
Expected: PASS — `# pass 14`, `# fail 0`, `# skipped 0`. If the npm registry is unreachable the `deno-audit reports advisories…` test reports itself as skipped instead; that is acceptable offline.

- [ ] **Step 7: Run the existing integration and CLI tests (regression)**

Run: `node --test dist/tool/test/integrations.test.js dist/tool/test/ts-rails-cli.test.js dist/tool/test/reporting.test.js`
Expected: PASS, `# fail 0`. These cover the Knip/dependency-cruiser path, CLI argument handling and SARIF/baseline output that now see the wider `integrations` type.

- [ ] **Step 8: Commit (include the regenerated CLI artifact)**

```bash
git add tool/src tool/test scripts/ts-rails-audit.cjs
git commit -m "feat: add deno-check, deno-lint, deno-graph and deno-audit integrations

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Acceptance against a real Deno project (read-only)

No source change in this task; it records evidence that the integrations measure what the native tools measure.

**Files:**
- Create: `docs/verification/2026-11-17-deno-integrations.md`

- [ ] **Step 1: Snapshot the target outside the repository, without `.env`**

Run (replace `TARGET` with the Deno project, `SNAP` with an empty directory outside both repositories):

```bash
git -C TARGET status --short            # must print nothing; commit or stash first if it does not
git -C TARGET archive HEAD | tar -x -C SNAP
cp TARGET/deno.lock SNAP/               # deno.lock is data; it may be gitignored
```

Expected: `SNAP` contains the sources and `deno.json`, and **no** `.env`, certificates or `node_modules`.

- [ ] **Step 2: Run the four integrations**

Run: `node scripts/ts-rails-audit.cjs --root SNAP --integration deno-check --integration deno-lint --integration deno-graph --integration deno-audit --format json > SNAP-report.json`
Expected: every entry of `integrations` has `"status": "COMPLETE"` and `deno` version `2.9.8`. The top-level report status is `INCOMPLETE` only if the project itself has source files that do not parse.

- [ ] **Step 3: Compare with the native tools**

For each integration compare the count in the report with the native command run inside `SNAP`:

| Integration | Report count (`results[].code`) | Native command | Must match |
| --- | --- | --- | --- |
| `deno-check` | `DENO_TYPE_ERROR` | `deno check` → `Found N errors` | N, counting only errors located in snapshot files |
| `deno-audit` | `DENO_AUDIT_ADVISORY` | `deno audit` → `Found N vulnerabilities` | N |
| `deno-lint` | `DENO_LINT` + `EXPLICIT_ANY` | `deno lint --json` diagnostics | `DENO_LINT` = total − `no-explicit-any` − `no-non-null-assertion` |
| `deno-graph` | `DENO_UNREACHABLE_FILE` | grep each flagged file name across `src`, `test`, `scripts` | no static importer exists for any flagged file |

Reference run on 2026-11-17 against the private backend (173 TypeScript files, Deno 2.9.8): `DENO_TYPE_ERROR` 8 (3 in `src/`, 4 in tests, 1 in `scripts/`; `deno check src/main.ts` alone passes), `DENO_AUDIT_ADVISORY` 30 (8 high; `node-forge` and `hono` reachable from entrypoints, `nodemailer` only through a file nothing imports), `DENO_LINT` 50, `DENO_UNREACHABLE_FILE` 11 (all 11 confirmed without a static importer), whole run 26 s. The syntax rules on the same snapshot still reported `EXPLICIT_ANY` 62 and `NON_NULL_ASSERTION` 132, equal to `deno lint`.

- [ ] **Step 4: Confirm the audited tree was not touched**

Run: `git -C TARGET status --short`
Expected: prints nothing (same as Step 1). The run happened on `SNAP`, but this also confirms nothing leaked back.

- [ ] **Step 5: Record the evidence**

Create `docs/verification/2026-11-17-deno-integrations.md` with the counts from Step 3 (counts and categories only; no private file names, paths or content), the Deno and Node versions, the command lines, and the three limits: parsers are pinned to Deno 2.9.8 output, `deno-graph` cannot see dynamic imports with computed specifiers, and `deno-audit` needs network access and a lockfile.

- [ ] **Step 6: Commit**

```bash
git add docs/verification/2026-11-17-deno-integrations.md
git commit -m "docs: record deno integration acceptance run

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reference documentation and rails

**Files:**
- Modify: `references/scanner.md`, `references/runtime-deno.md`, `SKILL.md`

- [ ] **Step 1: Document the integrations in `references/scanner.md`**

Append at the end of the file:

````markdown

## Deno integrations

For a Deno project the syntax rules cannot resolve import maps or JSR, and `typed` reports `DENO_SEMANTICS_UNSUPPORTED`. The Deno integrations run the project's own tools instead:

```sh
node scripts/ts-rails-audit.cjs --root TARGET --integration deno-check --integration deno-lint --integration deno-graph --integration deno-audit
```

Each runs in a temporary snapshot made of the inspected sources plus `deno.json(c)`, its `importMap` file and `deno.lock` as **data**. `.env`, certificates, `node_modules`, scripts and other configuration are never copied and the audited tree is never written. Deno's own cache is written outside the target. A missing `deno` executable, missing configuration, an unexpected output shape or a timeout makes the report `INCOMPLETE`; none of them is reported as clean. Parsers are pinned to Deno 2.9.8 output.

| Integration | Runs | Finding | Notes |
| --- | --- | --- | --- |
| `deno-check` | `deno check` over every snapshot file | `DENO_TYPE_ERROR` (P2) | Finds errors in files no entrypoint reaches, which `deno check src/main.ts` misses |
| `deno-lint` | `deno lint --json` with the project's lint config | `DENO_LINT` (P3) | `no-explicit-any` and `no-non-null-assertion` are not repeated; `EXPLICIT_ANY` and `NON_NULL_ASSERTION` own them |
| `deno-graph` | `deno info --json` per entrypoint | `DENO_UNREACHABLE_FILE` (P3) | Entrypoints: conventional `main/mod/index/server/app` (root or `src/`), files named in `deno.json` tasks/exports, all test files. No entrypoint found → `INCOMPLETE`. Dynamic imports with computed specifiers, scripts and Lambda handlers can be false positives |
| `deno-audit` | `deno audit` | `DENO_AUDIT_ADVISORY` (P2 for high/critical, otherwise P3) on `deno.lock` | Requires `deno.lock` (without it Deno reports no vulnerabilities, which is a false clean result). Sends package names and versions to the Deno advisory service. Each advisory is tagged `reachable from entrypoints` or `not in the entrypoint graph`; an advisory is a lead for `R0a`-compliant upgrade work, not a reason to upgrade blindly |

These findings come from the project's tools, so they are evidence of what Deno reports, not a security grade. They do not feed `--score`.
````

- [ ] **Step 2: Point `references/runtime-deno.md` at them**

In `references/runtime-deno.md`, replace the single line `## Executed data contracts` with:

````markdown
## Native checks through the auditor

`--integration deno-check|deno-lint|deno-graph|deno-audit` automates the read-only native checks described above against a data-only snapshot (see [scanner](scanner.md#deno-integrations)). Prefer them to hand-run commands for a first pass; they report `INCOMPLETE` rather than clean when Deno, the lockfile, the network or an entrypoint is missing. `deno test` is intentionally not wrapped: a suite can build native artifacts, need disposable databases or a native client (for example an Oracle client of a minimum version); run it only after reading its runner, with the narrowest permissions.

## Executed data contracts
````

- [ ] **Step 3: Update `SKILL.md`**

In `SKILL.md`, replace the line

`- \`references/scanner.md\`: setup, scope, completeness, rule limits and exit codes.`

with

`- \`references/scanner.md\`: setup, scope, completeness, rule limits, exit codes and the optional Deno integrations (\`deno-check\`, \`deno-lint\`, \`deno-graph\`, \`deno-audit\`) for Deno projects.`

and replace the sentence `Do not invent a security bypass to make tests pass.` (end of rail R4) with

`Do not invent a security bypass to make tests pass. A dependency advisory needs reachability from real entrypoints and a fix version before any upgrade; R0a still governs the upgrade itself.`

- [ ] **Step 4: Verify the edits and the existing contract tests**

Run: `git diff --stat references SKILL.md` — Expected: 3 files changed.
Run: `npm run build` — Expected: success. No test reads these Markdown files, so the check is that the build and the diff are clean.

- [ ] **Step 5: Commit**

```bash
git add references/scanner.md references/runtime-deno.md SKILL.md
git commit -m "docs: document deno integrations and advisory reachability rail

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Full verification

**Files:** none.

- [ ] **Step 1: Run the complete suite**

Run: `npm run verify`
Expected: `tsc --noEmit` clean, every `node --test` file passes, `npm --prefix examples/backend run check` clean. The full suite includes corpus and runtime tests and takes several minutes (more than ten on a loaded machine); run it in the background and wait for completion rather than polling.

- [ ] **Step 2: Confirm the working tree**

Run: `git status --short`
Expected: nothing (everything committed). `node_modules/` and `dist/` are ignored.

- [ ] **Step 3: Report**

State the commits, the test counts, and what was not verified: Deno versions other than 2.9.8, non-Windows platforms, and `deno-audit` while offline (test skipped).

---

## Self-review

**Spec coverage.** Design section 1 (Deno integrations): check/lint/graph/audit → Tasks 1–2; shared execution contract (snapshot as data, no `.env`, `shell: false`, bounded timeouts, version recorded, `INCOMPLETE` on any failure) → `deno-tools.ts`; reachability tag for advisories → `deno-audit` handler; severity mapping P2/P3 → handlers. Section 3 (docs, R4 rail) → Task 4. Verification plan items 1–2 (advisory with/without import, type error in an unreferenced file) → tests; lockfile-missing false-clean and no-entrypoint cases → tests; audited-tree-unchanged → tests plus Task 3. Not covered here, by decision: Oracle rules, `doctor`, `references/oracle.md` (Plan B), `deno-test` (Plan C), and the synthetic "advisory that is not imported" fixture, because the reachability negative is exercised only by the real-project acceptance run; add it to Plan B's fixture work if a stable offline-capable package is found.

**Placeholder scan.** No TBD/TODO steps; every code step contains the full file; edits to existing files are performed by a complete script.

**Type consistency.** `DenoIntegration`/`IntegrationName` (report.ts) are used by `constants/integrations.ts`, `deno-tools.ts` and `cli.ts`; `DenoGraph` (deno-output.ts) is extended as `Graph` in `deno-tools.ts`; `ParsedDiagnostic`/`ParsedAdvisory` field names (`code`, `message`, `file`, `line`; `title`, `severity`, `name`, `vulnerable`, `url`) match their uses in the handlers.

**Known limits.** Output parsers are pinned to Deno 2.9.8; `deno-graph` entrypoint detection is a heuristic; the `HEURISTIC` confidence label understates that these findings come from the project's own tools (decision 1).
