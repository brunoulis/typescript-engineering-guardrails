import type { DenoIntegration, IntegrationName } from '../types/report.js';
export const INTEGRATIONS: readonly IntegrationName[] = ['knip', 'dependency-cruiser', 'deno-check', 'deno-lint', 'deno-graph', 'deno-audit'];
export function isIntegration(value: unknown): value is IntegrationName {
  return INTEGRATIONS.includes(value as IntegrationName);
}
export function isDenoIntegration(name: IntegrationName): name is DenoIntegration {
  return name.startsWith('deno-');
}
