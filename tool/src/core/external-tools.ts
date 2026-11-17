import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { AuditOptions, AuditReport, Scope } from '../types/report.js';
import type { SourceFile } from 'typescript';
import { skillRoot, message } from './compiler.js';
import { inside, isTest, relative } from './project-discovery.js';

interface ToolResult { version: string; value: unknown }
export function runBounded(executable: string, args: string[], cwd: string, timeout = 30000): string {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1', KNIP_DISABLE_RAW_TRANSFER: '1' };
  delete env['NODE_OPTIONS']; delete env['NODE_PATH'];
  const output = spawnSync(executable, args, { cwd, env, encoding: 'utf8', shell: false, timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  if (output.error || output.signal || output.status === null || output.status > 1) throw Error(output.error?.message ?? `Tool execution failed: exit ${output.status}: ${output.stderr}`);
  return output.stdout;
}
function execute(name: string, cwd: string, args: string[]): ToolResult {
  const directory = path.join(skillRoot, 'node_modules', name);
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')) as { version: string; bin: string | Record<string, string> };
  const bin = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin[name === 'dependency-cruiser' ? 'depcruise' : name];
  if (!bin) throw Error('Missing trusted tool executable');
  return { version: metadata.version, value: JSON.parse(runBounded(process.execPath, [path.join(directory, bin), ...args], cwd)) as unknown };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid tool JSON output');
  return value as Record<string, unknown>;
}
export function externalTools(root: string, sources: Map<string, SourceFile>, options: AuditOptions, report: AuditReport): void {
  if (!options.integrations?.length) return;
  report.integrations = [];
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-snapshot-'));
  try {
    const selected = new Set<string>();
    for (const [file, source] of sources) {
      const rel = relative(root, file); selected.add(rel);
      const target = path.join(temp, rel); fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source.text);
    }
    if (!selected.size) throw Error('No successfully inspected sources for external integrations');
    // Source snapshots and a data-only dependency inventory enter the workspace.
    // Executable project configuration, scripts and node_modules are never copied.
    const manifest: Record<string, unknown> = { name: 'rails-source-snapshot', version: '1.0.0', private: true };
    const manifestPath = path.join(root, 'package.json');
    const hasManifest = fs.existsSync(manifestPath);
    if (hasManifest) {
      if (fs.lstatSync(manifestPath).isSymbolicLink() || !inside(root, fs.realpathSync(manifestPath)) || fs.statSync(manifestPath).size > 1024 * 1024) throw Error('Unsafe or oversized package manifest');
      const original = object(JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown);
      for (const key of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        if (original[key] === undefined) continue;
        const deps = object(original[key]);
        if (!Object.values(deps).every(v => typeof v === 'string')) throw Error('Invalid dependency inventory');
        manifest[key] = deps;
      }
      report.configsInspected++;
    }
    fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(temp, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', types: [] }, include: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'] }));
    const entry = ['src/index.ts', 'index.ts', 'src/main.ts', 'main.ts'].find(f => selected.has(f)) ?? [...selected][0];
    // The published 6.45.1 JSON schema contains two stale plugin names. Installed
    // plugin directories match its runtime registry (verified by integration tests).
    const pluginNames = fs.readdirSync(path.join(skillRoot, 'node_modules/knip/dist/plugins'), { withFileTypes: true }).filter(entry => entry.isDirectory() && !entry.name.startsWith('_')).map(entry => entry.name);
    const disabledPlugins = Object.fromEntries(pluginNames.map(name => [name, false]));
    fs.writeFileSync(path.join(temp, 'knip.json'), JSON.stringify({ ...disabledPlugins, entry: [entry], project: [...selected], includeEntryExports: false }));
    fs.writeFileSync(path.join(temp, 'cruise.json'), JSON.stringify({ forbidden: [{ name: 'no-circular', severity: 'warn', from: {}, to: { circular: true } }], options: { tsPreCompilationDeps: true, tsConfig: { fileName: 'tsconfig.json' }, doNotFollow: { path: 'node_modules' } } }));
    const add = (code: string, file: string, detail: string, line = 1): void => {
      file = file.replaceAll('\\', '/').replace(/^\.\//, '');
      if (!selected.has(file) && !(file === 'package.json' && hasManifest)) return;
      const scope: Scope = file === 'package.json' ? 'config' : isTest(file) ? 'test' : 'source';
      report.results.push({ code, file, line, detail, scope, severity: 'P3', confidence: 'HEURISTIC' });
    };
    for (const name of [...new Set(options.integrations)]) {
      const before = report.results.length;
      try {
        const result = execute(name, temp, name === 'knip' ? ['--config', 'knip.json', '--reporter', 'json', '--no-progress', '--no-gitignore', '--no-config-hints', '--no-tag-hints'] : ['--config', 'cruise.json', '--output-type', 'json', ...selected]);
        const data = object(result.value);
        if (name === 'knip') {
          if (!Array.isArray(data['issues'])) throw Error('Unexpected Knip report shape');
          for (const item of data['issues']) {
            const issue = object(item);
            if (typeof issue['file'] !== 'string') continue;
            if (Array.isArray(issue['files']) && issue['files'].length) add('KNIP_UNUSED_FILE', issue['file'], 'Unreachable in controlled source snapshot; verify real entry points/assets/workspace before removal');
            for (const key of ['dependencies', 'devDependencies', 'optionalDependencies']) {
              if (Array.isArray(issue[key])) for (const item of issue[key]) {
                const dependency = object(item);
                add('KNIP_UNUSED_DEPENDENCY', issue['file'], 'Dependency not referenced by selected-source snapshot: ' + String(dependency['name']) + '; config/assets/workspace use requires manual review');
              }
            }
            const exports = issue['exports'];
            if (Array.isArray(exports)) for (const item of exports) {
              const symbol = object(item);
              add('KNIP_UNUSED_EXPORT', issue['file'], 'Possibly unused export in controlled snapshot: ' + String(symbol['name']), typeof symbol['line'] === 'number' ? symbol['line'] : 1);
            }
          }
        } else {
          const summary = object(data['summary']);
          if (!Array.isArray(summary['violations'])) throw Error('Unexpected dependency-cruiser report shape');
          for (const item of summary['violations']) {
            const violation = object(item);
            if (typeof violation['from'] === 'string') add('EXTERNAL_DEPENDENCY_CYCLE', violation['from'], 'dependency-cruiser cycle in controlled source snapshot: ' + JSON.stringify(violation['cycle'] ?? violation['to']));
          }
        }
        report.integrations.push({ name, version: result.version, status: 'COMPLETE', findings: report.results.length - before });
      } catch (error) {
        report.integrations.push({ name, version: 'UNAVAILABLE', status: 'INCOMPLETE', findings: 0 });
        report.diagnostics.push({ code: 'EXTERNAL_TOOL_ERROR', file: '.', line: 1, message: name + ': ' + message(error) });
      }
    }
  } catch (error) { report.diagnostics.push({ code: 'EXTERNAL_SNAPSHOT_ERROR', file: '.', line: 1, message: message(error) }); }
  finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
