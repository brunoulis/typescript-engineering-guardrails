import path from 'node:path';
import type { Compiler } from '../types/report.js';

export const skillRoot = path.resolve(__dirname, '../../../..');
export function compilerAPI(value: unknown): Compiler {
  const required = ['createSourceFile', 'forEachChild', 'isCallExpression', 'isAsExpression', 'parseJsonText',
    'getLeadingCommentRanges', 'getTrailingCommentRanges', 'flattenDiagnosticMessageText'];
  if (!value || typeof value !== 'object' || !required.every(key => typeof Reflect.get(value, key) === 'function')) {
    throw Error('Incompatible TypeScript compiler API; use the pinned skill dependency or TS_RAILS_TYPESCRIPT_PATH');
  }
  return value as Compiler;
}
export function getTS(_root?: string): Compiler {
  const override = process.env['TS_RAILS_TYPESCRIPT_PATH'];
  if (override) {
    if (!path.isAbsolute(override)) throw Error('TS_RAILS_TYPESCRIPT_PATH must be an absolute trusted compiler API module path');
    return compilerAPI(require(override) as unknown);
  }
  try { return compilerAPI(require(path.join(skillRoot, 'node_modules/typescript')) as unknown); }
  catch (error) { throw Error('Missing compatible TypeScript compiler API. Prepare the skill with npm ci --ignore-scripts, or set TS_RAILS_TYPESCRIPT_PATH. ' + message(error)); }
}
export function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
