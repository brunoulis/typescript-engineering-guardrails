import fs from 'node:fs';
import path from 'node:path';
import { EXCLUDED_DIRS } from '../constants/defaults.js';
import type { AuditOptions } from '../types/report.js';
export function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/') || '.';
}

export function isTest(file: string): boolean {
  return /(^|\/)(__tests__|tests?|fixtures?)(\/|$)|(?:[._](?:test|spec)|(?:^|\/)test)\.[cm]?tsx?$/.test(file);
}

export function inside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

export function collect(root: string, options: AuditOptions) {
  const selected = new Set<string>();
  const visited = new Set<string>();
  const skipped: { path: string; reason: string }[] = [];
  let testsExcluded = 0;
  function visit(file: string): void {
    if (visited.has(file)) return;
    visited.add(file);
    const name = relative(root, file);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
      skipped.push({ path: name, reason: 'symlink' });
    } else if (stat.isDirectory()) {
      if (file !== root && EXCLUDED_DIRS.has(path.basename(file))) {
        skipped.push({ path: name, reason: 'dependency/build directory' });
        return;
      }
      for (const entry of fs.readdirSync(file).sort()) visit(path.join(file, entry));
    } else if (stat.isFile() && /\.[cm]?tsx?$/.test(file) && !/\.d\.[cm]?ts$/.test(file)) {
      if (options.excludeTests && isTest(name)) {
        testsExcluded++;
        skipped.push({ path: name, reason: 'test scope' });
      } else {
        selected.add(file);
      }
    }
  }
  for (const entry of options.paths || ['.']) {
    const target = path.resolve(root, entry);
    if (!inside(root, target)) throw Error('Selected path escapes outside --root: ' + entry);
    // Check ancestors too: a selected file below a junction must not escape the root.
    const actual = fs.realpathSync(target);
    if (!inside(root, actual)) throw Error('Selected path resolves outside --root: ' + entry);
    visit(target);
  }
  return { files: [...selected].sort(), skipped, testsExcluded };
}

export function files(root: string, options: AuditOptions = {}) {
  return collect(fs.realpathSync.native(root), options).files;
}

