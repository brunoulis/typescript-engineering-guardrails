import type { AuditReport } from '../types/report.js';
const uri = (file: string): string => file.split('/').map(encodeURIComponent).join('/');
export function sarif(report: AuditReport): object {
  const codes = [...new Set(report.results.map(f => f.code))].sort();
  return { $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0', runs: [{
    tool: { driver: { name: 'typescript-engineering-guardrails', version: '2.0.0', informationUri: 'https://github.com/brunoulis/typescript-engineering-guardrails', rules: codes.map(id => ({ id, shortDescription: { text: id }, properties: { precision: 'low', tags: ['heuristic'] } })) } },
    invocations: [{ executionSuccessful: report.status === 'COMPLETE', toolExecutionNotifications: report.diagnostics.map(d => ({ descriptor: { id: d.code }, level: 'error', message: { text: `${d.file}:${d.line}: ${d.message}` } })) }],
    results: report.results.map(f => ({ ruleId: f.code, level: f.severity === 'P2' ? 'warning' : 'note', message: { text: f.detail },
      locations: [{ physicalLocation: { artifactLocation: { uri: uri(f.file), uriBaseId: '%SRCROOT%' }, region: { startLine: f.line } } }],
      ...(f.fingerprint ? { partialFingerprints: { 'rails/v1': f.fingerprint } } : {}), properties: { confidence: f.confidence, scope: f.scope, priority: f.severity } })),
    properties: { disclaimer: report.disclaimer, status: report.status },
  }] };
}
