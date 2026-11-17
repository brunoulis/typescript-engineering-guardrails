import path from 'node:path';
import type { AuditOptions } from './types/report.js';
import { audit } from './core/audit.js';
import { getTS, message } from './core/compiler.js';
import { readConfig } from './core/config.js';
import { compareBaseline, fingerprints, writeBaseline } from './core/baseline.js';
import { textReport } from './reporters/text.js';
import { jsonReport } from './reporters/json.js';
import { sarif } from './reporters/sarif.js';

export function main(args: string[] = process.argv.slice(2)): number {
  try {
    let root = '.', format = 'text', fail = false, config: string | undefined;
    let baseline: string | undefined, destination: string | undefined, failNew = false, replace = false;
    const cli: AuditOptions = {};
    const value = (i: number): string => {
      const result = args[i];
      if (!result || result.startsWith('--')) throw Error('Missing value for ' + args[i - 1]);
      return result;
    };
    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--root': root = value(++i); break;
        case '--format': format = value(++i); break;
        case '--config': config = value(++i); break;
        case '--path': (cli.paths ??= []).push(value(++i)); break;
        case '--exclude-tests': cli.excludeTests = true; break;
        case '--score': cli.score = true; break;
        case '--project': cli.project = value(++i); break;
        case '--mode': {
          const mode = value(++i);
          if (mode !== 'syntax' && mode !== 'typed') throw Error('Invalid mode: ' + mode);
          cli.mode = mode; break;
        }
        case '--integration': {
          const name = value(++i);
          if (name !== 'knip' && name !== 'dependency-cruiser') throw Error('Invalid integration: ' + name);
          (cli.integrations ??= []).push(name); break;
        }
        case '--fail-on-signals': fail = true; break;
        case '--baseline': baseline = value(++i); break;
        case '--write-baseline': destination = value(++i); break;
        case '--fail-on-new': failNew = true; break;
        case '--replace-baseline': replace = true; break;
        case '--help':
          console.log('Usage: node scripts/ts-rails-audit.cjs --root DIR [--mode syntax|typed] [--project TSCONFIG] [--config JSON] [--path FILE_OR_DIR] [--exclude-tests] [--score] [--integration knip|dependency-cruiser] [--format text|json|sarif] [--baseline JSON] [--write-baseline JSON] [--replace-baseline] [--fail-on-new] [--fail-on-signals]');
          return 0;
        default: throw Error('Unknown argument ' + args[i]);
      }
    }
    if (!['text', 'json', 'sarif'].includes(format)) throw Error('Invalid format: ' + format);
    if (failNew && !baseline) throw Error('--fail-on-new requires --baseline');
    if (replace && !destination) throw Error('--replace-baseline requires --write-baseline');
    if (baseline && destination && path.resolve(baseline) === path.resolve(destination)) throw Error('Cannot compare and overwrite the same baseline in one invocation');
    const options = { ...(config ? readConfig(config) : {}), ...cli };
    const ts = getTS(root);
    const report = audit(root, ts, options);
    if (baseline || destination || format === 'sarif') fingerprints(report, ts);
    try {
      if (baseline) compareBaseline(baseline, report, options);
      if (destination) writeBaseline(destination, report, options, replace);
    } catch (error) {
      report.diagnostics.push({ code: 'BASELINE_ERROR', file: '.', line: 1, message: message(error) });
      report.status = 'INCOMPLETE';
      for (const dimension of Object.values(report.score?.dimensions ?? {})) dimension.grade = null;
    }
    console.log(format === 'json' ? jsonReport(report) : format === 'sarif' ? JSON.stringify(sarif(report), null, 2) : textReport(report));
    return report.status === 'INCOMPLETE' ? 1 : (fail && report.results.length) || (failNew && report.baseline?.added) ? 2 : 0;
  } catch (error) { console.error(message(error)); return 1; }
}
