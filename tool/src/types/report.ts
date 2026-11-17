import type * as ts from 'typescript';
export type Compiler = typeof ts;
export type Severity = 'P2' | 'P3';
export type Scope = 'source' | 'test' | 'config';
export type Emit = (code: string, severity: Severity, line: number, detail: string) => void;
export interface Finding {
  code: string; severity: Severity; confidence: 'HEURISTIC'; file: string;
  line: number; scope: Scope; detail: string; fingerprint?: string;
}
export interface Diagnostic { code: string; file: string; line: number; message: string }
export interface Boundary { from: string; disallow: string[] }
export interface AuditOptions {
  paths?: string[]; excludeTests?: boolean; maxFileBytes?: number;
  mode?: 'syntax' | 'typed'; project?: string; score?: boolean;
  rules?: Record<string, boolean>; boundaries?: Boundary[];
  concurrencyLimit?: number; complexityLimit?: number; cloneMinTokens?: number;
  integrations?: ('knip' | 'dependency-cruiser')[];
}
export interface Edge { from: string; to: string; line: number; typeOnly: boolean }
export interface Dimension { grade: number | null; evidence: { file: string; line: number; detail: string }[]; note: string }
export interface AuditReport {
  schemaVersion: 1; root: string; compilerVersion: string; status: 'COMPLETE' | 'INCOMPLETE';
  filesDiscovered: number; filesInspected: number; configsInspected: number; testsExcluded: number;
  skipped: { path: string; reason: string }[]; diagnostics: Diagnostic[]; disclaimer: string; results: Finding[];
  mode?: 'syntax' | 'typed'; semantic?: { projects: string[]; contextFiles: number; externalReads: string[] };
  graph?: { version: 1; edges: Edge[] };
  score?: { version: 1; dimensions: Record<string, Dimension> };
  baseline?: { added: number; known: number; absent: number; comparable: boolean };
  integrations?: { name: string; version: string; status: 'COMPLETE' | 'INCOMPLETE'; findings: number }[];
}
