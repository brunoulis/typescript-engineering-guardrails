import fs from 'node:fs';
import path from 'node:path';
import type { Compiler, AuditOptions } from '../types/report.js';
import type { TypedContext } from '../interfaces/typed-context.js';
import { inside } from './project-discovery.js';
import { message } from './compiler.js';

type Diagnose = (code: string, file: string, message: string, line?: number) => void;
export function typedProject(root: string, files: string[], ts: Compiler, options: AuditOptions, diagnose: Diagnose): TypedContext {
  const context: TypedContext = { programs: [], sources: new Map(), projects: [], externalReads: [] };
  if (typeof ts.createProgram !== 'function' || typeof ts.getPreEmitDiagnostics !== 'function') {
    diagnose('TYPED_API_UNAVAILABLE', root, 'Trusted compiler does not expose semantic APIs'); return context;
  }
  const requested = path.resolve(root, options.project ?? 'tsconfig.json');
  const denoConfig = ['deno.json', 'deno.jsonc'].find(name => fs.existsSync(path.join(root, name)));
  if (/^deno\.jsonc?$/.test(path.basename(requested)) || (!options.project && !fs.existsSync(requested) && denoConfig)) {
    diagnose('DENO_SEMANTICS_UNSUPPORTED', path.join(root, denoConfig ?? path.basename(requested)),
      'Deno configuration, import maps and runtime libraries are not resolved by this TypeScript Program adapter. Use syntax triage and the project\'s deno check separately; do not create a tsconfig or install target dependencies for this audit.');
    return context;
  }
  const libraryRoot = path.dirname(ts.getDefaultLibFilePath({}));
  let totalBytes = 0;
  const seenReads = new Map<string, string | undefined>();
  const allowed = (file: string): boolean => {
    try {
      const real = fs.realpathSync(file);
      return inside(root, real) || inside(libraryRoot, real);
    } catch { return false; }
  };
  const read = (file: string): string | undefined => {
    const key = path.resolve(file);
    if (seenReads.has(key)) return seenReads.get(key);
    if (!allowed(key)) {
      if (fs.existsSync(key)) diagnose('READ_OUTSIDE_ROOTS', key, 'Semantic read resolves outside the project and trusted compiler roots');
      seenReads.set(key, undefined); return undefined;
    }
    try {
      const bytes = fs.statSync(key).size;
      totalBytes += bytes;
      const fileLimit = /\.d\.[cm]?ts$/.test(key) ? 16 * 1024 * 1024 : (options.maxFileBytes ?? 2 * 1024 * 1024);
      if (bytes > fileLimit || totalBytes > 128 * 1024 * 1024 || seenReads.size >= 20000) {
        diagnose('SEMANTIC_READ_LIMIT', key, 'Semantic read exceeds file/128 MiB/20000 file budget');
        seenReads.set(key, undefined); return undefined;
      }
      if (!inside(root, key)) context.externalReads.push(key);
      const text = fs.readFileSync(key, 'utf8'); seenReads.set(key, text); return text;
    } catch (error) { diagnose('SEMANTIC_READ_ERROR', key, message(error)); return undefined; }
  };
  const diagnostics = (items: readonly import('typescript').Diagnostic[]): void => {
    for (const d of items) diagnose('TS' + d.code, d.file?.fileName ?? root,
      ts.flattenDiagnosticMessageText(d.messageText, '\n'), d.file ? d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1 : 1);
  };
  const seenProjects = new Set<string>();
  function load(config: string): void {
    config = path.resolve(config);
    if (seenProjects.has(config)) return;
    seenProjects.add(config);
    if (!inside(root, config) || !allowed(config)) { diagnose('PROJECT_CONFIG_ERROR', config, 'Project config must exist within the audited root'); return; }
    context.projects.push(config);
    const result = ts.readConfigFile(config, read);
    if (result.error) { diagnostics([result.error]); return; }
    const parsed = ts.parseJsonConfigFileContent(result.config, { ...ts.sys, readFile: read,
      fileExists: f => allowed(f) && ts.sys.fileExists(f),
      readDirectory: (...args) => ts.sys.readDirectory(...args).filter(allowed),
    }, path.dirname(config), { noEmit: true, noCheck: false }, config);
    diagnostics(parsed.errors);
    for (const reference of parsed.projectReferences ?? []) load(ts.resolveProjectReferencePath(reference));
    const host = ts.createCompilerHost(parsed.options, true);
    host.readFile = read;
    host.fileExists = f => allowed(f) && ts.sys.fileExists(f);
    host.writeFile = () => { throw Error('Auditor must never emit files'); };
    const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, host,
      ...(parsed.projectReferences ? { projectReferences: parsed.projectReferences } : {}) });
    context.programs.push(program);
    diagnostics(ts.getPreEmitDiagnostics(program));
    const checker = program.getTypeChecker();
    for (const source of program.getSourceFiles()) {
      const key = path.resolve(source.fileName);
      if (inside(root, key) && !source.isDeclarationFile) context.sources.set(key, { source, checker, program });
    }
  }
  try { load(path.resolve(root, options.project ?? 'tsconfig.json')); }
  catch (error) { diagnose('SEMANTIC_PROJECT_ERROR', root, message(error)); }
  if (context.programs.length) for (const file of files) if (!context.sources.has(file)) diagnose('OUTSIDE_PROJECT', file, 'Selected file was not included in a resolved TypeScript program');
  context.externalReads.sort();
  return context;
}
