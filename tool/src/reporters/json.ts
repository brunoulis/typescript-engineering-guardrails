import type { AuditReport } from '../types/report.js';
export function jsonReport(report: AuditReport): string { return JSON.stringify(report, null, 2); }
