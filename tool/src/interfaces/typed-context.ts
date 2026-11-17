import type * as ts from 'typescript';
export interface TypedContext {
  programs: ts.Program[];
  sources: Map<string, { source: ts.SourceFile; checker: ts.TypeChecker; program: ts.Program }>;
  projects: string[];
  externalReads: string[];
}
