import { performance } from 'node:perf_hooks';
import { audit, getTS } from '../src/index.js';
import { snapshot } from './corpus.js';

export interface Sample {
  mode: 'syntax' | 'typed'; auditMs: number; peakRssBytes: number; endingRssBytes: number;
  status: string; filesInspected: number; contextFiles: number; findings: number; compilerVersion: string; targetUnchanged: boolean;
}

const root = process.argv[2]; const mode = process.argv[3];
if (!root || (mode !== 'syntax' && mode !== 'typed')) throw Error('Usage: worker ROOT syntax|typed');
const before = snapshot(root); const compiler = getTS();
const start = performance.now();
const report = audit(root, compiler, { mode, score: false });
const elapsed = performance.now() - start;
if (report.status !== 'COMPLETE') throw Error('Benchmark analysis incomplete: ' + JSON.stringify(report.diagnostics));
const result: Sample = { mode, auditMs: elapsed, peakRssBytes: process.resourceUsage().maxRSS * 1024, endingRssBytes: process.memoryUsage().rss, status: report.status, filesInspected: report.filesInspected, contextFiles: report.semantic?.contextFiles ?? 0, findings: report.results.length, compilerVersion: report.compilerVersion, targetUnchanged: before === snapshot(root) };
if (!result.targetUnchanged) throw Error('Benchmark target changed');
process.stdout.write(JSON.stringify(result));
