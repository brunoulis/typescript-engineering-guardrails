#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = fs.realpathSync(process.cwd());
const byteLimit = 12 * 1024;
const entryLimit = 256;
const dirs = ['src', 'types', 'test', 'tests'];
const excluded = new Set(['node_modules', 'dist', 'build', 'coverage', '__snapshots__']);
const source = /\.(?:[cm]?[jt]sx?)$/i;
const runner = /^run[-_]tests?\.(?:ps1|sh|[cm]?js)$/i;

function localFile(name) {
  const absolute = path.resolve(root, name);
  const relative = path.relative(root, absolute);
  if (!relative || path.isAbsolute(relative) || relative.split(path.sep)[0] === '..' ||
      path.relative(absolute, fs.realpathSync(absolute)) !== '' || !fs.statSync(absolute).isFile()) {
    throw new Error('Expected a regular file in the current package: ' + name);
  }
  return relative;
}

// Bound discovery as well as output on packages with generated or vendored code.
function discover() {
  const files = [];
  const rootEntries = [];
  let entries = 0;
  let incomplete = false;
  function walk(dir) {
    const iterator = fs.opendirSync(path.join(root, dir));
    try {
      let entry;
      while ((entry = iterator.readSync()) !== null) {
        if (++entries > entryLimit) { incomplete = true; break; }
        if (!dir && !entry.name.startsWith('.') && !excluded.has(entry.name)) rootEntries.push(entry.name);
        if (entry.name.startsWith('.') || excluded.has(entry.name)) continue;
        const name = path.join(dir, entry.name);
        if (entry.isDirectory() && (dir || dirs.includes(entry.name))) walk(name);
        if (incomplete) break;
        if (entry.isFile() && (entry.name === 'AGENTS.md' || source.test(name) || (!dir && (runner.test(name) ||
            name === 'package.json' || name === 'tsconfig.json')))) files.push(name);
      }
    } finally { iterator.closeSync(); }
  }
  walk('');
  return { files: files.sort(), incomplete, rootEntries: rootEntries.sort() };
}

function printContext(args) {
  if (args.includes('--help')) {
    console.log('node package-context.cjs [--brief FILE] [FILE ...] (run from the package root)');
    console.log('node package-context.cjs --task FILE [FILE ...] prints skill guidance and package context for an editor request');
    return;
  }
  const task = args[0] === '--task';
  let brief;
  if (task || args[0] === '--brief') {
    args.shift();
    if (!args.length) throw new Error('Expected a task or brief file');
    brief = localFile(args.shift());
  }
  const result = args.length ? { files: args.map(localFile), incomplete: false } : discover();
  const files = [...new Set([...(brief ? [brief] : []), ...result.files])];
  if (result.rootEntries) console.log('Package root' + (result.incomplete ? ' (partial)' : '') + ': ' + result.rootEntries.slice(0, 48).join(', ') + (result.rootEntries.length > 48 ? ', …' : ''));
  const sizes = files.map(file => fs.statSync(path.join(root, file)).size);
  if (result.incomplete || sizes.reduce((a, b) => a + b, 0) > byteLimit) {
    if (task) process.exitCode = 2;
    console.log('Select the relevant files or symbols. ' + (result.incomplete ? 'Inventory is partial.' : 'Combined sources exceed 12 KiB.'));
    for (const [i, file] of files.slice(0, 48).entries()) console.log(sizes[i] + ' B  ' + file);
    if (files.length > 48) console.log('Additional paths omitted.');
    return;
  }
  if (task) {
    console.log('Draft a unified Git patch directly from the supplied package snapshot, without tool calls. The caller collected these files and will apply the patch and run the project checks locally.');
    console.log('Return only the patch, with relative a/ and b/ paths, context lines and /dev/null for new files. Include the implementation and regression tests. For missing context, request the specific files instead. Leave the working tree to the caller.');
    console.log(fs.readFileSync(path.join(__dirname, '..', 'SKILL.md'), 'utf8').trimEnd());
  }
  let remaining = byteLimit;
  for (const file of files) {
    const fd = fs.openSync(path.join(root, localFile(file)), 'r');
    const buffer = Buffer.alloc(remaining + 1);
    let used = 0;
    try {
      while (used < buffer.length) {
        const count = fs.readSync(fd, buffer, used, buffer.length - used, null);
        if (!count) break;
        used += count;
      }
    } finally { fs.closeSync(fd); }
    if (used > remaining) {
      if (task) process.exitCode = 2;
      console.log('File grew beyond the output budget: ' + file);
      continue;
    }
    remaining -= used;
    console.log('\n--- ' + file + ' ---\n' + buffer.toString('utf8', 0, used).trimEnd());
  }
}

try { printContext(process.argv.slice(2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
