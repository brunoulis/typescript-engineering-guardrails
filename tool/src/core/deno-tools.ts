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
