import path from 'node:path';
import type * as ts from 'typescript';
import type { Compiler, AuditOptions, AuditReport, Edge, Finding } from '../types/report.js';
import type { TypedContext } from '../interfaces/typed-context.js';
import { inside, isTest, relative } from './project-discovery.js';
import { analyzeQuality } from './quality.js';

function prefix(value: string, boundary: string): boolean {
  const clean = boundary.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
  return clean === '.' || value === clean || value.startsWith(clean + '/');
}

/** Analyze static imports/reexports; resolution reads only admitted in-memory sources. */
export function analyzeProject(root: string, ts: Compiler, sources: Map<string, ts.SourceFile>, options: AuditOptions, report: AuditReport, typed?: TypedContext): void {
  const context = new Map(sources);
  for (const [file, entry] of typed?.sources ?? []) {
    if (inside(root, file) && !entry.source.isDeclarationFile && !relative(root, file).split('/').includes('node_modules')) context.set(file, entry.source);
  }
  const canonical = (file: string): string => ts.sys.useCaseSensitiveFileNames ? path.resolve(file) : path.resolve(file).toLowerCase();
  const admitted = new Map([...context].map(([file, source]) => [canonical(file), { file, source }]));
  const directories = new Set<string>();
  for (const file of context.keys()) {
    let directory = path.dirname(file);
    while (!directories.has(canonical(directory))) { directories.add(canonical(directory)); const parent = path.dirname(directory); if (parent === directory) break; directory = parent; }
  }
  const host: ts.ModuleResolutionHost = {
    fileExists: file => admitted.has(canonical(file)),
    readFile: file => admitted.get(canonical(file))?.source.text,
    directoryExists: directory => directories.has(canonical(directory)),
    getCurrentDirectory: () => root,
  };
  const edges: Edge[] = [];
  const emit = (code: string, file: string, line: number, detail: string): void => {
    if (options.rules?.[code] === false) return;
    report.results.push({ code, severity: code === 'FORBIDDEN_DEPENDENCY' ? 'P2' : 'P3', confidence: 'HEURISTIC', file, line, scope: isTest(file) ? 'test' : 'source', detail });
  };
  for (const [file, source] of [...context].sort(([a], [b]) => a.localeCompare(b))) {
    const from = relative(root, file);
    const compilerOptions = typed?.sources.get(file)?.program.getCompilerOptions() ?? { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext };
    const add = (literal: ts.StringLiteralLike, kinds: boolean[]): void => {
      const specifier = literal.text;
      const moduleSource = typed?.sources.get(file)?.checker.getSymbolAtLocation(literal)?.declarations?.find(ts.isSourceFile);
      const resolved = moduleSource ? undefined : ts.resolveModuleName(specifier, file, compilerOptions, host).resolvedModule;
      const resolvedFile = moduleSource?.fileName ?? resolved?.resolvedFileName;
      const target = resolvedFile ? admitted.get(canonical(resolvedFile)) : undefined;
      const to = target ? relative(root, target.file) : undefined;
      const line = source.getLineAndCharacterOfPosition(literal.getStart(source)).line + 1;
      for (const typeOnly of kinds) if (to) edges.push({ from, to, line, typeOnly });
      if (sources.has(file) && options.boundaries?.some(boundary => prefix(from, boundary.from) && boundary.disallow.some(forbidden => prefix(specifier, forbidden) || (to !== undefined && prefix(to, forbidden))))) {
        emit('FORBIDDEN_DEPENDENCY', from, line, `Configured boundary forbids ${specifier}${to ? ` (${to})` : ''} from ${from}; static dependency, including type-only imports. Review the declared layer contract.`);
      }
    };
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteralLike(statement.moduleSpecifier)) {
        const clause = statement.importClause;
        if (clause?.isTypeOnly) add(statement.moduleSpecifier, [true]);
        else if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          const elements = clause.namedBindings.elements;
          add(statement.moduleSpecifier, [...(elements.some(e => e.isTypeOnly) ? [true] : []), ...(!elements.length || clause.name || elements.some(e => !e.isTypeOnly) ? [false] : [])]);
        } else add(statement.moduleSpecifier, [false]);
      } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)) {
        if (statement.isTypeOnly) add(statement.moduleSpecifier, [true]);
        else if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          const elements = statement.exportClause.elements;
          add(statement.moduleSpecifier, [...(elements.some(e => e.isTypeOnly) ? [true] : []), ...(!elements.length || elements.some(e => !e.isTypeOnly) ? [false] : [])]);
        } else add(statement.moduleSpecifier, [false]);
      } else if (ts.isImportEqualsDeclaration(statement) && ts.isExternalModuleReference(statement.moduleReference) && statement.moduleReference.expression && ts.isStringLiteralLike(statement.moduleReference.expression)) add(statement.moduleReference.expression, [statement.isTypeOnly]);
    }
  }
  edges.sort((a, b) => a.from.localeCompare(b.from) || a.line - b.line || a.to.localeCompare(b.to) || Number(a.typeOnly) - Number(b.typeOnly));
  report.graph = { version: 1, edges };
  const runtime = new Map<string, Edge[]>();
  for (const edge of edges) if (!edge.typeOnly) { const outgoing = runtime.get(edge.from) ?? []; outgoing.push(edge); runtime.set(edge.from, outgoing); }
  const selected = new Set([...sources.keys()].map(file => relative(root, file)));
  const indices = new Map<string, number>(); const low = new Map<string, number>();
  const active = new Set<string>(); const stack: string[] = []; const components: string[][] = [];
  const visit = (file: string): void => {
    const index = indices.size;
    indices.set(file, index); low.set(file, index); active.add(file); stack.push(file);
    for (const edge of runtime.get(file) ?? []) {
      if (!indices.has(edge.to)) { visit(edge.to); low.set(file, Math.min(low.get(file)!, low.get(edge.to)!)); }
      else if (active.has(edge.to)) low.set(file, Math.min(low.get(file)!, indices.get(edge.to)!));
    }
    if (low.get(file) === index) {
      const component: string[] = []; let member: string;
      do { member = stack.pop()!; active.delete(member); component.push(member); } while (member !== file);
      components.push(component);
    }
  };
  for (const file of [...runtime.keys()].sort()) if (!indices.has(file)) visit(file);
  for (const component of components) {
    const first = component.filter(file => selected.has(file)).sort()[0];
    if (!first || (component.length === 1 && !runtime.get(first)?.some(edge => edge.to === first))) continue;
    const members = new Set(component); const pending = [first]; const previous = new Map<string, string | undefined>([[first, undefined]]);
    let cycle: string[] | undefined;
    for (let cursor = 0; cursor < pending.length && !cycle; cursor++) {
      const current = pending[cursor]!;
      for (const edge of runtime.get(current) ?? []) {
        if (!members.has(edge.to)) continue;
        if (edge.to === first) {
          cycle = [current]; let predecessor = previous.get(current);
          while (predecessor !== undefined) { cycle.unshift(predecessor); predecessor = previous.get(predecessor); }
          cycle.push(first); break;
        }
        if (!previous.has(edge.to)) { previous.set(edge.to, current); pending.push(edge.to); }
      }
    }
    if (cycle) {
      const line = runtime.get(first)?.find(edge => edge.to === cycle[1])?.line ?? 1;
      emit('DEPENDENCY_CYCLE', first, line, `Runtime import cycle: ${cycle.join(' -> ')}. Static imports do not prove a runtime failure; review initialization and layer ownership.`);
    }
  }
  analyzeQuality(root, ts, sources, options, report, edges);
  report.results.sort((a: Finding, b: Finding) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));
}
