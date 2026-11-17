import fs from 'node:fs';
import path from 'node:path';
import type { SourceFile, Diagnostic } from 'typescript';
import type { Compiler, AuditOptions, AuditReport, Finding, Emit } from '../types/report.js';
import { compilerAPI, message } from './compiler.js';
import { collect, relative, isTest } from './project-discovery.js';
import { MAX_FILE_BYTES, DISCLAIMER } from '../constants/defaults.js';
import { inspectSource, inspectDeno } from '../rules/syntax.js';
import { typedProject } from './typed-project.js';
import { semanticRules } from '../rules/typed.js';
import { validateOptions } from './config.js';
import { analyzeProject } from './dependency-graph.js';
import { externalTools } from './external-tools.js';
import { inspectFrameworks } from '../rules/frameworks.js';
export function audit(root: string, ts: Compiler, options: AuditOptions = {}): AuditReport {
  compilerAPI(ts);
  options = validateOptions(options);
  root = fs.realpathSync(path.resolve(root));
  if (!fs.statSync(root).isDirectory()) throw Error('--root must be a directory');
  const maxFileBytes = options.maxFileBytes ?? MAX_FILE_BYTES;
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1) throw Error('maxFileBytes must be a positive integer');
  const inventory = collect(root, options);
  const inspectedSources = new Map<string, SourceFile>();
  const report: AuditReport = {
    schemaVersion: 1, root, compilerVersion: ts.version, status: 'COMPLETE',
    filesDiscovered: inventory.files.length, filesInspected: 0, configsInspected: 0,
    testsExcluded: inventory.testsExcluded, skipped: inventory.skipped,
    diagnostics: [], disclaimer: DISCLAIMER, results: [],
  };
  function diagnose(code: string, file: string, message: string, line = 1): void {
    report.diagnostics.push({ code, file: relative(root, file), line, message });
  }
  const typed = options.mode === 'typed' ? typedProject(root, inventory.files, ts, options, diagnose) : undefined;
  if (typed) {
    report.mode = 'typed';
    report.semantic = { projects: typed.projects.map(p => relative(root, p)), contextFiles: typed.sources.size, externalReads: typed.externalReads };
  }
  function inspect(file: string, config: boolean): void {
    let source;
    try {
      if (fs.statSync(file).size > maxFileBytes) {
        diagnose('FILE_TOO_LARGE', file, 'File exceeds ' + maxFileBytes + ' bytes; audit is incomplete');
        return;
      }
      const text = fs.readFileSync(file, 'utf8');
      source = config ? ts.parseJsonText(file.split(path.sep).join('/'), text) :
        ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      if ((source as SourceFile & { parseDiagnostics: readonly Diagnostic[] }).parseDiagnostics.length) {
        for (const error of (source as SourceFile & { parseDiagnostics: readonly Diagnostic[] }).parseDiagnostics) diagnose(
          config ? 'CONFIG_PARSE_ERROR' : 'SOURCE_PARSE_ERROR', file,
          ts.flattenDiagnosticMessageText(error.messageText, '\n'),
          source.getLineAndCharacterOfPosition(error.start || 0).line + 1,
        );
        return;
      }
      const emit: Emit = (code, severity, line, detail) => report.results.push({
        code, severity, confidence: 'HEURISTIC', file: relative(root, file), line,
        scope: config ? 'config' : isTest(relative(root, file)) ? 'test' : 'source', detail,
      });
      if (config) {
        inspectDeno(source, ts, emit);
        report.configsInspected++;
      } else {
        const resolved = typed?.sources.get(file);
        if (typed && !resolved) return;
        inspectSource(resolved?.source ?? source, ts, emit, resolved ? semanticRules(ts, resolved.checker, resolved.program, options.concurrencyLimit) : undefined);
        inspectFrameworks(resolved?.source ?? source, ts, emit);
        inspectedSources.set(file, resolved?.source ?? source);
        report.filesInspected++;
      }
    } catch (error) {
      diagnose('FILE_INSPECTION_ERROR', file, message(error));
    }
  }
  for (const file of inventory.files) inspect(file, false);
  // Root Deno config is inspected independently of --path. Do not follow config symlinks.
  for (const name of ['deno.json', 'deno.jsonc']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    if (fs.lstatSync(file).isSymbolicLink()) diagnose('CONFIG_SYMLINK', file, 'Config symlink was not inspected');
    else inspect(file, true);
  }
  if (inventory.files.length === 0) diagnose('NO_SOURCE_FILES', root, 'No TypeScript source files in selected scope');
  if (typed || options.score || options.boundaries?.length) analyzeProject(root, ts, inspectedSources, options, report, typed);
  externalTools(root, inspectedSources, options, report);
  report.results = report.results.filter(f => options.rules?.[f.code] !== false);
  if (report.diagnostics.length) {
    report.status = 'INCOMPLETE';
    for (const dimension of Object.values(report.score?.dimensions ?? {})) dimension.grade = null;
  }
  report.results.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));
  return report;
}

export function scan(root: string, ts: Compiler, options: AuditOptions = {}): Finding[] {
  const report = audit(root, ts, options);
  if (report.status !== 'COMPLETE') throw Error('Audit incomplete: ' + report.diagnostics.map((d) => d.file + ': ' + d.message).join('; '));
  return report.results;
}

