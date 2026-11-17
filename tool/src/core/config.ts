import fs from 'node:fs';
import type { AuditOptions } from '../types/report.js';
import { RULE_CODES } from '../constants/rules.js';

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export function validateOptions(value: unknown, config = false): AuditOptions {
  if (!record(value)) throw Error('Configuration must be a JSON object');
  const allowed = new Set(['paths', 'excludeTests', 'maxFileBytes', 'mode', 'project', 'score', 'rules', 'boundaries', 'concurrencyLimit', 'complexityLimit', 'cloneMinTokens', 'integrations', ...(config ? ['version'] : [])]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw Error('Unknown configuration option: ' + key);
  if (config && value['version'] !== 1) throw Error('Configuration version must be 1');
  for (const key of ['maxFileBytes', 'concurrencyLimit', 'complexityLimit', 'cloneMinTokens']) {
    const n = value[key];
    if (n !== undefined && (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1)) throw Error(key + ' must be a positive integer');
  }
  for (const key of ['excludeTests', 'score']) if (value[key] !== undefined && typeof value[key] !== 'boolean') throw Error(key + ' must be boolean');
  if (value['mode'] !== undefined && value['mode'] !== 'syntax' && value['mode'] !== 'typed') throw Error('Invalid mode');
  if (value['project'] !== undefined && (typeof value['project'] !== 'string' || !value['project'])) throw Error('project must be a nonempty path');
  if (value['paths'] !== undefined && (!Array.isArray(value['paths']) || !value['paths'].length || !value['paths'].every(p => typeof p === 'string' && p.length > 0))) throw Error('paths must be a nonempty array of paths');
  if (value['rules'] !== undefined && (!record(value['rules']) || !Object.values(value['rules']).every(v => typeof v === 'boolean'))) throw Error('rules must map rule codes to booleans');
  if (record(value['rules'])) for (const code of Object.keys(value['rules'])) if (!RULE_CODES.has(code)) throw Error('Unknown rule: ' + code);
  if (value['integrations'] !== undefined && (!Array.isArray(value['integrations']) || !value['integrations'].every(p => p === 'knip' || p === 'dependency-cruiser'))) throw Error('Invalid integrations');
  if (value['boundaries'] !== undefined && (!Array.isArray(value['boundaries']) || !value['boundaries'].every(b => record(b) && Object.keys(b).every(k => ['from', 'disallow'].includes(k)) && typeof b['from'] === 'string' && b['from'].length && Array.isArray(b['disallow']) && b['disallow'].every(p => typeof p === 'string' && p.length)))) throw Error('Invalid boundaries');
  const { version: _version, ...options } = value;
  return options as AuditOptions;
}
export function readConfig(file: string): AuditOptions {
  if (fs.statSync(file).size > 1024 * 1024) throw Error('Configuration exceeds 1 MiB');
  return validateOptions(JSON.parse(fs.readFileSync(file, 'utf8')) as unknown, true);
}
