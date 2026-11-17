import type { AuditReport } from '../types/report.js';
export function textReport(report: AuditReport): string {
  const lines = [report.status + ': ' + report.filesInspected + '/' + report.filesDiscovered + ' source files, ' + report.configsInspected + ' configs, ' + report.testsExcluded + ' tests excluded; ' + report.results.length + ' signals', report.disclaimer];
  for (const f of report.results) lines.push(`${f.severity} ${f.code} [${f.scope}] ${f.file}:${f.line} — ${f.detail}`);
  for (const d of report.diagnostics) lines.push(`${d.code} ${d.file}:${d.line} — ${d.message}`);
  if (report.baseline) lines.push(`Baseline: ${report.baseline.added} new, ${report.baseline.known} known, ${report.baseline.absent} absent; comparable=${report.baseline.comparable}`);
  for (const [name, d] of Object.entries(report.score?.dimensions ?? {})) lines.push(`Score ${name}: ${d.grade ?? 'N/E'} (${d.evidence.length} leads) — ${d.note}`);
  return lines.join('\n');
}
