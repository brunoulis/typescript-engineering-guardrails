import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Parsers are pinned to the output formats of Deno 2.9.8 and fail closed on any other shape.
export interface ParsedDiagnostic { code: string; file: string; line: number; message: string }
export interface ParsedAdvisory { title: string; severity: string; name: string; vulnerable: string; url: string }
export interface DenoGraph { files: Set<string>; packages: Set<string> }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Snapshot-relative POSIX path for a file URL; callers drop anything outside the snapshot. */
function relativeUrl(snapshot: string, url: string): string {
  return path.relative(snapshot, fileURLToPath(url)).replaceAll('\\', '/');
}

export function parseCheck(output: string, snapshot: string): ParsedDiagnostic[] {
  const lines = output.split(/\r?\n/);
  const found: ParsedDiagnostic[] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = /^(TS\d+) \[ERROR\]: (.*)$/.exec(lines[i] ?? '');
    if (!head) continue;
    for (let j = i + 1; j < lines.length && !/^TS\d+ \[ERROR\]/.test(lines[j] ?? ''); j++) {
      const at = /^\s+at (file:\/\/\S+?):(\d+):\d+\s*$/.exec(lines[j] ?? '');
      if (at) {
        found.push({ code: head[1] ?? '', message: head[2] ?? '', file: relativeUrl(snapshot, at[1] ?? ''), line: Number(at[2]) });
        break;
      }
    }
  }
  return found;
}

export function parseLint(json: string, snapshot: string): ParsedDiagnostic[] {
  const data: unknown = JSON.parse(json);
  if (!record(data) || !Array.isArray(data['diagnostics']) || !Array.isArray(data['errors'])) throw Error('Unexpected deno lint JSON shape');
  if (data['errors'].length) throw Error('deno lint reported errors: ' + JSON.stringify(data['errors']).slice(0, 300));
  return data['diagnostics'].map((item: unknown): ParsedDiagnostic => {
    const range = record(item) ? item['range'] : undefined;
    const start = record(range) ? range['start'] : undefined;
    if (!record(item) || typeof item['filename'] !== 'string' || typeof item['code'] !== 'string' || typeof item['message'] !== 'string' || !record(start) || typeof start['line'] !== 'number') throw Error('Unexpected deno lint diagnostic shape');
    return { code: item['code'], message: item['message'], file: relativeUrl(snapshot, item['filename']), line: start['line'] };
  });
}

export function parseInfo(json: string, snapshot: string): DenoGraph {
  const data: unknown = JSON.parse(json);
  if (!record(data) || !Array.isArray(data['modules'])) throw Error('Unexpected deno info JSON shape');
  const catalog = record(data['npmPackages']) ? data['npmPackages'] : {};
  const files = new Set<string>(), direct = new Set<string>();
  for (const module of data['modules'] as unknown[]) {
    if (!record(module) || typeof module['specifier'] !== 'string') throw Error('Unexpected deno info module shape');
    const specifier = module['specifier'];
    if (specifier.startsWith('file://')) files.add(relativeUrl(snapshot, specifier));
    const npm = /^npm:\/((?:@[^/@]+\/)?[^/@]+)@([^/_]+)/.exec(specifier);
    if (npm) direct.add(npm[1] + '@' + npm[2]);
  }
  const packages = new Set<string>(), seen = new Set<string>(), queue = [...direct];
  for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = catalog[key];
    packages.add(record(entry) && typeof entry['name'] === 'string' ? entry['name'] : key.slice(0, key.lastIndexOf('@')));
    if (record(entry) && Array.isArray(entry['dependencies'])) for (const dependency of entry['dependencies'] as unknown[]) if (typeof dependency === 'string') queue.push(dependency);
  }
  return { files, packages };
}

export function parseAudit(text: string): ParsedAdvisory[] {
  if (/No known vulnerabilities found/.test(text)) return [];
  const advisories: ParsedAdvisory[] = [];
  for (const block of text.split(/^╭ /m).slice(1)) {
    // Anchored to box lines: the trailing "Severity: 0 low, ..." summary can follow a warning box.
    const field = (label: string): string | undefined => new RegExp('^[│╰]\\s*' + label + ':\\s+(.+)$', 'm').exec(block)?.[1]?.trim();
    const severity = field('Severity');
    if (!severity) continue; // non-advisory boxes such as deprecation warnings
    const name = field('Package'), vulnerable = field('Vulnerable'), url = field('Info');
    if (!name || !vulnerable || !url) throw Error('Unexpected deno audit advisory shape');
    advisories.push({ title: (block.split(/\r?\n/)[0] ?? '').trim(), severity, name, vulnerable, url });
  }
  const total = /Found (\d+) vulnerabilit/.exec(text);
  if (!total || Number(total[1]) !== advisories.length) throw Error('Unexpected deno audit output shape');
  return advisories;
}
