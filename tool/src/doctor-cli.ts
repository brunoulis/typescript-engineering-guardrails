import { message } from './core/compiler.js';
import { doctorText, oracleDoctor } from './core/oracle-doctor.js';

const USAGE = 'Usage: node scripts/ts-rails-audit.cjs doctor oracle [--root DIR] [--client-dir DIR] [--min-client MAJOR[.MINOR]] [--format text|json]';
/** Exit 0 OK/NOT_REQUIRED, 1 usage error or unknown client version, 2 client missing or too old. */
export function doctorMain(args: string[]): number {
  try {
    if (args[0] !== 'oracle') throw Error(USAGE);
    let root = '.', format = 'text', minimum = '19.1', clientDir: string | undefined;
    const value = (i: number): string => {
      const result = args[i];
      if (!result || result.startsWith('--')) throw Error('Missing value for ' + args[i - 1]);
      return result;
    };
    for (let i = 1; i < args.length; i++) {
      switch (args[i]) {
        case '--root': root = value(++i); break;
        case '--client-dir': clientDir = value(++i); break;
        case '--min-client': minimum = value(++i); break;
        case '--format': format = value(++i); break;
        default: throw Error('Unknown argument ' + args[i] + '\n' + USAGE);
      }
    }
    if (format !== 'text' && format !== 'json') throw Error('Invalid format: ' + format);
    const report = oracleDoctor({ root, minimum, clientDir, env: process.env, platform: process.platform });
    console.log(format === 'json' ? JSON.stringify(report, null, 2) : doctorText(report));
    return report.status === 'OK' || report.status === 'NOT_REQUIRED' ? 0 : report.status === 'VERSION_UNKNOWN' ? 1 : 2;
  } catch (error) { console.error(message(error)); return 1; }
}
