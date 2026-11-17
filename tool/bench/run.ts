import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { distribution, runCorpus, snapshot } from './corpus.js';
import { writeBenchmarkFixture } from './fixture.js';
import type { Sample } from './worker.js';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output' || !args[1])) throw Error('Usage: run.js [--output PATH]');
const destination = path.resolve(args[1] ?? 'docs/verification/benchmark-v2.json');
const repository = process.cwd();
if (!fs.existsSync(path.join(repository, 'tool/src/core/audit.ts'))) throw Error('Run benchmark from the repository root');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-fixed-benchmark-'));
const repetitions = 5; const warmupRuns = 1;
const sourceHashBefore = snapshot(path.join(repository, 'tool/src'));
const benchmarkHashBefore = snapshot(path.join(repository, 'tool/bench'));
const measurements: unknown[] = [];
try {
  for (const size of [20, 100]) {
    const root = path.join(temporary, `sources-${size}`); writeBenchmarkFixture(root, size);
    const targetHash = snapshot(root);
    const sourceBytes = fs.readdirSync(root).filter(file => file.endsWith('.ts')).reduce((sum, file) => sum + fs.statSync(path.join(root, file)).size, 0);
    for (const mode of ['syntax', 'typed'] as const) {
      const samples: (Sample & { processWallMs: number })[] = [];
      for (let repetition = -warmupRuns; repetition < repetitions; repetition++) {
        const start = performance.now();
        const child = spawnSync(process.execPath, [path.join(__dirname, 'worker.js'), root, mode], { encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024, windowsHide: true });
        const processWallMs = performance.now() - start;
        if (child.error || child.status !== 0) throw Error(`Benchmark child failed (${mode}/${size}): ${child.error?.message ?? child.stderr}`);
        const sample = JSON.parse(child.stdout) as Sample;
        if (sample.status !== 'COMPLETE' || sample.filesInspected !== size || !sample.targetUnchanged) throw Error('Benchmark worker did not inspect the complete immutable fixture');
        if (repetition >= 0) samples.push({ ...sample, processWallMs });
      }
      if (snapshot(root) !== targetHash) throw Error('Target changed during repeated measurement');
      measurements.push({ mode, sourceFiles: size, sourceBytes, fixtureSha256: targetHash, samples, summary: { auditMs: distribution(samples.map(sample => sample.auditMs)), processWallMs: distribution(samples.map(sample => sample.processWallMs)), peakRssBytes: distribution(samples.map(sample => sample.peakRssBytes)) } });
      console.log(`${mode}: ${size} files, ${sourceBytes} bytes, median audit ${distribution(samples.map(sample => sample.auditMs)).median.toFixed(1)} ms`);
    }
  }
  const corpus = runCorpus();
  const sourceHashAfter = snapshot(path.join(repository, 'tool/src'));
  if (sourceHashBefore !== sourceHashAfter || benchmarkHashBefore !== snapshot(path.join(repository, 'tool/bench'))) throw Error('Auditor or benchmark sources changed during measurement; rerun with a stable source snapshot');
  const artifact = {
    version: 1, measuredAt: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
    osRelease: os.release(), cpu: os.cpus()[0]?.model ?? 'unknown', logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem(),
    gitBase: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), auditorSourceSha256: sourceHashBefore, benchmarkSourceSha256: benchmarkHashBefore,
    methodology: { sizes: [20, 100], repetitions, warmupRuns, score: false, separateChildPerSample: true, targetImmutable: true, auditTimerExcludesCompilerLoad: true, peakRssIncludesProcessAndCompiler: true, quartiles: 'R-7 linear interpolation', note: 'Sequential fresh processes, one discarded fresh-process warmup per scenario; OS cache uncontrolled. No before/after implementation comparison or performance improvement claim.' },
    measurements, corpus,
  };
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, JSON.stringify(artifact, null, 2) + '\n');
  console.log(`Wrote ${destination}`);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
