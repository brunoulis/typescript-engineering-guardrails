import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { audit, getTS } from '../src/index.js';
import type { AuditReport } from '../src/types/report.js';

type Mode = 'syntax' | 'typed';
interface LabelledCase { name: string; rule: string; source: string; expected: number; deno?: string }
export interface Counts { tp: number; fp: number; fn: number }
export interface CaseResult extends Counts { name: string; mode: Mode; rule: string; expected: number; actual: number; status: AuditReport['status']; diagnostics: AuditReport['diagnostics']; targetUnchanged: boolean; contextFiles: number }
export interface CorpusResult { version: 1; labels: number; cases: CaseResult[]; totals: Record<Mode, Counts> }

// Desired signal counts are literal review labels, never derived from auditor output.
const corpus: readonly LabelledCase[] = [
  // TypeScript v6.0.3 src/lib/es5.d.ts JSON.parse signature, Apache-2.0, Microsoft.
  // Rewrapped in a .ts exported interface so this fixture exercises the source rule (declarations are normally excluded).
  { name: 'upstream-typescript-6.0.3-json-signature', rule: 'EXPLICIT_ANY', source: 'export interface UpstreamJSON { parse(text: string, reviver?: (this: any, key: string, value: any) => any): any; }', expected: 4 },
  { name: 'explicit-any', rule: 'EXPLICIT_ANY', source: 'export let value: any;', expected: 1 },
  { name: 'unknown-boundary', rule: 'EXPLICIT_ANY', source: 'export let value: unknown;', expected: 0 },
  { name: 'non-null-invariant', rule: 'NON_NULL_ASSERTION', source: 'declare const value: string | undefined; export const result = value!;', expected: 1 },
  { name: 'negation', rule: 'NON_NULL_ASSERTION', source: 'export const result = !false;', expected: 0 },
  { name: 'swallowed-exception', rule: 'EMPTY_CATCH', source: 'try { JSON.parse("bad"); } catch {}', expected: 1 },
  { name: 'rethrow', rule: 'EMPTY_CATCH', source: 'try { JSON.parse("bad"); } catch (error) { throw error; }', expected: 0 },
  { name: 'raw-json-cast', rule: 'UNVALIDATED_JSON_CAST', source: 'export const value = JSON.parse("{}") as { id: string };', expected: 1 },
  { name: 'ordinary-object-cast', rule: 'UNVALIDATED_JSON_CAST', source: 'export const value = { id: "x" } as { id: string };', expected: 0 },
  { name: 'security-toggle', rule: 'AUTH_SECURITY_DISABLED', source: 'export const options = { disableCSRFCheck: true };', expected: 1 },
  { name: 'security-toggle-false', rule: 'AUTH_SECURITY_DISABLED', source: 'export const options = { disableCSRFCheck: false };', expected: 0 },
  { name: 'dynamic-fanout', rule: 'POTENTIALLY_UNBOUNDED_CONCURRENCY', source: 'export async function run(rows: number[]) { return Promise.all(rows.map(async value => value)); }', expected: 1 },
  { name: 'fixed-fanout', rule: 'POTENTIALLY_UNBOUNDED_CONCURRENCY', source: 'export const value = Promise.all([Promise.resolve(1), Promise.resolve(2)]);', expected: 0 },
  { name: 'suppression-directive', rule: 'TS_SUPPRESSION', source: '// @ts-ignore intentional corpus case\nexport const value: number = "x";', expected: 1 },
  { name: 'suppression-mentioned-in-string', rule: 'TS_SUPPRESSION', source: 'export const value = "// @ts-ignore";', expected: 0 },
  { name: 'broad-deno-task', rule: 'BROAD_DENO_PERMISSIONS', source: 'export {};', deno: '{"tasks":{"test":"deno test -A"}}', expected: 1 },
  { name: 'scoped-deno-task', rule: 'BROAD_DENO_PERMISSIONS', source: 'export {};', deno: '{"tasks":{"test":"deno test --allow-net=127.0.0.1:55432"}}', expected: 0 },
  { name: 'builtin-json-alias', rule: 'UNVALIDATED_JSON_CAST', source: 'const parse = JSON.parse; export const value = parse("{}") as { id: string };', expected: 1 },
  { name: 'shadowed-json', rule: 'UNVALIDATED_JSON_CAST', source: 'const JSON = {parse: (_input:string) => ({id:"x"})}; export const value = JSON.parse("{}") as { id: string };', expected: 0 },
  { name: 'small-static-tuple-map', rule: 'POTENTIALLY_UNBOUNDED_CONCURRENCY', source: 'const rows = [1, 2] as const; export const result = Promise.all(rows.map(async value => value));', expected: 0 },
  { name: 'large-static-tuple-map', rule: 'POTENTIALLY_UNBOUNDED_CONCURRENCY', source: 'const rows = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17] as const; export const result = Promise.all(rows.map(async value => value));', expected: 1 },
];

export function classify(expected: number, actual: number): Counts {
  return { tp: Math.min(expected, actual), fp: Math.max(0, actual - expected), fn: Math.max(0, expected - actual) };
}

/** R-7 linearly interpolated quartiles, same convention for even and odd samples. */
export function distribution(values: number[]): { median: number; min: number; max: number; iqr: number } {
  if (!values.length || values.some(value => !Number.isFinite(value))) throw Error('Finite measurements required');
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (fraction: number): number => {
    const index = (sorted.length - 1) * fraction; const lower = Math.floor(index); const weight = index - lower;
    return sorted[lower]! * (1 - weight) + sorted[Math.ceil(index)]! * weight;
  };
  return { median: quantile(0.5), min: sorted[0]!, max: sorted.at(-1)!, iqr: quantile(0.75) - quantile(0.25) };
}

export function snapshot(root: string): string {
  const hash = createHash('sha256');
  const visit = (directory: string): void => {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      if (fs.statSync(file).isDirectory()) visit(file);
      else { hash.update(path.relative(root, file).replaceAll('\\', '/')); hash.update('\0'); hash.update(fs.readFileSync(file)); hash.update('\0'); }
    }
  };
  visit(root); return hash.digest('hex');
}

export function runCorpus(): CorpusResult {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-labelled-corpus-'));
  const compiler = getTS(); const cases: CaseResult[] = [];
  const totals: Record<Mode, Counts> = { syntax: { tp: 0, fp: 0, fn: 0 }, typed: { tp: 0, fp: 0, fn: 0 } };
  try {
    for (const fixture of corpus) {
      const directory = path.join(root, fixture.name); fs.mkdirSync(directory);
      fs.writeFileSync(path.join(directory, 'sample.ts'), fixture.source);
      fs.writeFileSync(path.join(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, types: [], target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM'] }, files: ['sample.ts'] }));
      if (fixture.deno) fs.writeFileSync(path.join(directory, 'deno.json'), fixture.deno);
      const before = snapshot(directory);
      for (const mode of ['syntax', 'typed'] as const) {
        const report = audit(directory, compiler, { mode });
        const actual = report.results.filter(finding => finding.code === fixture.rule).length;
        const counts = classify(fixture.expected, actual);
        cases.push({ name: fixture.name, mode, rule: fixture.rule, expected: fixture.expected, actual, ...counts, status: report.status, diagnostics: report.diagnostics, targetUnchanged: before === snapshot(directory), contextFiles: report.semantic?.contextFiles ?? 0 });
        totals[mode].tp += counts.tp; totals[mode].fp += counts.fp; totals[mode].fn += counts.fn;
      }
    }
    return { version: 1, labels: corpus.length, cases, totals };
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
