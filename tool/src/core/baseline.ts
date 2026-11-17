import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AuditOptions, AuditReport, Compiler, Finding } from '../types/report.js';

interface Baseline { version: 1; policy: string; fingerprints: string[] }
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + stable(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
function policy(options: AuditOptions, root: string): string {
  return stable({ mode: 'syntax', excludeTests: false, maxFileBytes: 2 * 1024 * 1024,
    score: false, rules: {}, boundaries: [], concurrencyLimit: 16, complexityLimit: 15, cloneMinTokens: 60, integrations: [], ...options,
    ...(options.project ? { project: path.relative(root, path.resolve(root, options.project)).replaceAll('\\', '/') } : {}),
    paths: [...(options.paths ?? ['.'])].map(p => path.relative(root, path.resolve(root, p)).replaceAll('\\', '/') || '.').sort() });
}
function context(root: string, finding: Finding, ts: Compiler): string {
  if (finding.scope === 'config') return finding.detail;
  const file = path.resolve(root, finding.file);
  if (!fs.existsSync(file)) return finding.detail;
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  let text = source.text.split(/\r?\n/)[finding.line - 1] ?? finding.detail;
  function visit(node: import('typescript').Node): void {
    const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const end = source.getLineAndCharacterOfPosition(node.end).line + 1;
    if (start <= finding.line && end >= finding.line) {
      if (ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isExpressionStatement(node) || ts.isPropertyAssignment(node) || ts.isTypeAliasDeclaration(node)) text = node.getText(source);
      ts.forEachChild(node, visit);
    }
  }
  visit(source);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
  const tokens: string[] = [];
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) tokens.push(scanner.getTokenText());
  return tokens.join('|');
}
export function fingerprints(report: AuditReport, ts: Compiler): void {
  const counts = new Map<string, number>();
  for (const f of report.results) {
    const key = [f.code, f.file, context(report.root, f, ts)].join('|');
    const count = (counts.get(key) ?? 0) + 1; counts.set(key, count);
    f.fingerprint = crypto.createHash('sha256').update(key + '|' + count).digest('hex');
  }
}
export function compareBaseline(file: string, report: AuditReport, options: AuditOptions): void {
  if (fs.statSync(file).size > 8 * 1024 * 1024) throw Error('Baseline exceeds 8 MiB');
  const value = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Baseline>;
  if (value.version !== 1 || typeof value.policy !== 'string' || !Array.isArray(value.fingerprints) || !value.fingerprints.every(f => typeof f === 'string' && /^[a-f0-9]{64}$/.test(f))) throw Error('Invalid baseline');
  if (value.policy !== policy(options, report.root)) throw Error('Baseline scope/mode/rules do not match this scan');
  const old = new Set(value.fingerprints);
  let known = 0;
  for (const f of report.results) if (old.delete(f.fingerprint ?? '')) known++;
  const comparable = report.status === 'COMPLETE';
  report.baseline = { added: report.results.length - known, known, absent: comparable ? old.size : 0, comparable };
}
export function writeBaseline(file: string, report: AuditReport, options: AuditOptions, replace = false): void {
  if (report.status !== 'COMPLETE') throw Error('Cannot write baseline from an incomplete audit');
  if (!file.endsWith('.json') || /(?:^|[\\/])(?:package(?:-lock)?|tsconfig(?:\.[^/\\]+)?|deno|rails)\.json$/.test(file)) throw Error('Baseline destination must be a dedicated .json report, not source/config');
  const dest = path.resolve(file);
  const parent = fs.realpathSync(path.dirname(dest));
  if (path.resolve(parent, path.basename(dest)) !== dest) throw Error('Baseline parent resolves through a symlink');
  const stat = fs.lstatSync(dest, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink()) throw Error('Baseline destination is a symlink');
  if (stat) {
    if (!replace) throw Error('Baseline exists; use --replace-baseline explicitly');
    // Only a valid baseline owned by this tool may be replaced.
    const previous = JSON.parse(fs.readFileSync(dest, 'utf8')) as Partial<Baseline>;
    if (previous.version !== 1 || !Array.isArray(previous.fingerprints) || typeof previous.policy !== 'string') throw Error('Refusing to replace a non-baseline file');
  }
  const data: Baseline = { version: 1, policy: policy(options, report.root), fingerprints: report.results.map(f => f.fingerprint ?? '').sort() };
  const text = JSON.stringify(data, null, 2) + '\n';
  if (!stat) fs.writeFileSync(dest, text, { flag: 'wx', mode: 0o600 });
  else {
    // Atomic replacement never opens/truncates a link target if the destination
    // changes after validation. A new destination always uses exclusive creation.
    const temporary = path.join(parent, '.rails-baseline-' + crypto.randomUUID() + '.tmp');
    try { fs.writeFileSync(temporary, text, { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, dest); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
}
