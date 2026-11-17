import fs from 'node:fs';
import path from 'node:path';
import { EXCLUDED_DIRS } from '../constants/defaults.js';

export interface DoctorOptions { root: string; minimum: string; env: NodeJS.ProcessEnv; platform: NodeJS.Platform; clientDir?: string | undefined }
export interface ClientEvidence { dir: string; origin: string; library: string; version: string | undefined; versionEvidence: string }
export interface DoctorReport {
  schemaVersion: 1;
  status: 'OK' | 'TOO_OLD' | 'VERSION_UNKNOWN' | 'MISSING' | 'NOT_REQUIRED';
  mode: { value: 'thick' | 'thin'; evidence: { file: string; line: number }[] };
  minimum: string;
  client: ClientEvidence | undefined;
  foreignLibraries: { file: string; platform: string }[];
  notes: string[];
  disclaimer: string;
}

const DISCLAIMER = 'File metadata and source text only: no library is loaded and no connection is opened. Credentials, network reachability and privileges are not checked.';
const LIBRARY: Partial<Record<NodeJS.Platform, RegExp>> = {
  win32: /^oci\.dll$/i, linux: /^libclntsh\.so(?:\.\d+)*$/, darwin: /^libclntsh\.dylib(?:\.\d+)*$/,
};
const NATIVE_FILE = /^(?:libclntsh|libocci|libnnz|oci)[^/]*\.(so(?:\.\d+)*|dll|dylib)$/i;
const PLATFORM_OF: Record<string, string> = { so: 'linux', dll: 'win32', dylib: 'darwin' };

/** Parses "19", "19.1" or "19.21.0" into comparable numbers; undefined when it is not a version. */
export function parseVersion(text: string): number[] | undefined {
  return /^\d+(?:\.\d+)*$/.test(text) ? text.split('.').map(Number) : undefined;
}
export function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
}
/** Version from the library file suffix (libclntsh.so.19.1), the Instant Client directory name (instantclient_19_21) or an Oracle home path (.../product/12.2.0/client_64/bin). */
export function clientVersion(dir: string, library: string): { version: string | undefined; evidence: string } {
  const suffix = /\.(?:so|dylib)\.(\d+(?:\.\d+)*)$/.exec(library)?.[1];
  if (suffix) return { version: suffix, evidence: 'library file name ' + library };
  const folder = /instantclient[_-](\d+)[_-](\d+)/i.exec(path.basename(dir));
  if (folder) return { version: folder[1] + '.' + folder[2], evidence: 'directory name ' + path.basename(dir) };
  const home = /[\\/]product[\\/](\d+(?:\.\d+)*)[\\/]/i.exec(dir)?.[1];
  if (home) return { version: home, evidence: 'Oracle home path ' + dir };
  return { version: undefined, evidence: 'no version in the file name, directory name or Oracle home path' };
}
function findClient(options: DoctorOptions, notes: string[]): ClientEvidence | undefined {
  const pattern = LIBRARY[options.platform];
  if (!pattern) { notes.push('Unsupported platform for client discovery: ' + options.platform); return undefined; }
  const candidates: [string, string][] = [];
  if (options.clientDir) candidates.push([options.clientDir, '--client-dir']);
  if (options.env['ORACLE_CLIENT_LIB_DIR']) candidates.push([options.env['ORACLE_CLIENT_LIB_DIR'], 'ORACLE_CLIENT_LIB_DIR']);
  for (const name of ['PATH', 'LD_LIBRARY_PATH', 'DYLD_LIBRARY_PATH']) {
    for (const dir of (options.env[name] ?? '').split(path.delimiter)) if (dir) candidates.push([dir, name]);
  }
  for (const [dir, origin] of candidates) {
    let names: string[];
    try { names = fs.readdirSync(dir); } catch { if (origin !== 'PATH') notes.push(origin + ' is not a readable directory: ' + dir); continue; }
    const library = names.find(name => pattern.test(name));
    if (!library) { if (origin === '--client-dir' || origin === 'ORACLE_CLIENT_LIB_DIR') notes.push(origin + ' has no Oracle client library: ' + dir); continue; }
    const found = clientVersion(dir, library);
    return { dir, origin, library, version: found.version, versionEvidence: found.evidence };
  }
  return undefined;
}
function sourceFiles(root: string, found: string[] = [], foreign: string[] = [], depth = 0): { sources: string[]; natives: string[] } {
  if (depth > 6) return { sources: found, natives: foreign };
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) { if (!EXCLUDED_DIRS.has(entry.name)) sourceFiles(file, found, foreign, depth + 1); }
    else if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) found.push(file);
    else if (NATIVE_FILE.test(entry.name)) foreign.push(file);
  }
  return { sources: found, natives: foreign };
}

export function oracleDoctor(options: DoctorOptions): DoctorReport {
  const minimum = parseVersion(options.minimum);
  if (!minimum) throw Error('minimum must look like 19 or 19.1');
  const root = fs.realpathSync.native(path.resolve(options.root));
  const notes: string[] = [];
  const { sources, natives } = sourceFiles(root);
  const evidence: { file: string; line: number }[] = [];
  for (const file of sources) {
    if (fs.statSync(file).size > 2 * 1024 * 1024) continue;
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((text, index) => {
      if (/\binitOracleClient\s*\(|\.thin\s*=\s*false\b/.test(text)) evidence.push({ file: path.relative(root, file).replaceAll('\\', '/'), line: index + 1 });
    });
  }
  const mode = evidence.length ? 'thick' : 'thin';
  const foreignLibraries = natives.map(file => ({ file: path.relative(root, file).replaceAll('\\', '/'), platform: PLATFORM_OF[(/\.(so|dll|dylib)(?:\.\d+)*$/i.exec(file)?.[1] ?? '').toLowerCase()] ?? 'unknown' }))
    .filter(item => item.platform !== options.platform).sort((a, b) => a.file.localeCompare(b.file));
  const client = findClient(options, notes);
  let status: DoctorReport['status'];
  if (mode === 'thin') status = 'NOT_REQUIRED';
  else if (!client) status = 'MISSING';
  else {
    const version = client.version ? parseVersion(client.version) : undefined;
    status = !version ? 'VERSION_UNKNOWN' : compareVersions(version, minimum) < 0 ? 'TOO_OLD' : 'OK';
  }
  return { schemaVersion: 1, status, mode: { value: mode, evidence }, minimum: options.minimum, client, foreignLibraries, notes, disclaimer: DISCLAIMER };
}
export function doctorText(report: DoctorReport): string {
  const lines = [`${report.status}: driver mode ${report.mode.value}${report.mode.evidence.length ? ' (' + report.mode.evidence.map(e => e.file + ':' + e.line).join(', ') + ')' : ' (no initOracleClient call found; thin is the driver default)'}`];
  lines.push(report.client ? `Client ${report.client.version ?? 'version unknown'} at ${report.client.dir} (from ${report.client.origin}; ${report.client.versionEvidence}); required minimum ${report.minimum}` : `No Oracle client library found; required minimum ${report.minimum}`);
  for (const item of report.foreignLibraries) lines.push(`Native library for ${item.platform} in the project tree: ${item.file} (intended for another platform or a container? it is not used on this one)`);
  for (const note of report.notes) lines.push('Note: ' + note);
  lines.push(report.disclaimer);
  return lines.join('\n');
}
