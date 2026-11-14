#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'vendor',
  '.turbo', '.output', '.nuxt', '.svelte-kit',
]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const DISCLAIMER = 'Heuristic signals, not proven vulnerabilities; COMPLETE describes selected syntax coverage, not application correctness.';

function compilerAPI(value) {
  const required = ['createSourceFile', 'forEachChild', 'isCallExpression', 'isAsExpression',
    'parseJsonText', 'getLeadingCommentRanges', 'getTrailingCommentRanges', 'flattenDiagnosticMessageText'];
  if (!value || !required.every((key) => typeof value[key] === 'function')) {
    throw Error('Incompatible TypeScript compiler API; use the pinned skill dependency or TS_RAILS_TYPESCRIPT_PATH');
  }
  return value;
}

function getTS(_root) {
  // An explicit override must be honored, including an error; never silently use another compiler.
  if (process.env.TS_RAILS_TYPESCRIPT_PATH) {
    if (!path.isAbsolute(process.env.TS_RAILS_TYPESCRIPT_PATH)) {
      throw Error('TS_RAILS_TYPESCRIPT_PATH must be an absolute trusted compiler API module path');
    }
    return compilerAPI(require(process.env.TS_RAILS_TYPESCRIPT_PATH));
  }
  try {
    // An absolute skill-local path also prevents Node's ancestor package lookup
    // from executing an audited project's compiler when the skill is installed there.
    return compilerAPI(require(path.join(__dirname, '..', 'node_modules', 'typescript')));
  } catch (error) {
    throw Error('Missing compatible TypeScript compiler API. Prepare the skill with npm ci --ignore-scripts, or set TS_RAILS_TYPESCRIPT_PATH. ' + error.message);
  }
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/') || '.';
}

function isTest(file) {
  return /(^|\/)(__tests__|tests?|fixtures?)(\/|$)|\.(test|spec)\.[cm]?tsx?$/.test(file);
}

function inside(root, target) {
  const rel = path.relative(root, target);
  return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

function collect(root, options) {
  const selected = new Set();
  const visited = new Set();
  const skipped = [];
  let testsExcluded = 0;
  function visit(file) {
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

function files(root, options = {}) {
  return collect(fs.realpathSync(root), options).files;
}

function memberName(node, ts) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  if (ts.isComputedPropertyName(node) && ts.isStringLiteral(node.expression)) return node.expression.text;
  return undefined;
}

function access(node, ts) {
  if (ts.isPropertyAccessExpression(node)) return { object: node.expression, name: node.name.text };
  if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) {
    return { object: node.expression, name: node.argumentExpression.text };
  }
  return undefined;
}

function unwrap(node, ts) {
  while (ts.isParenthesizedExpression(node) || ts.isAwaitExpression(node)) node = node.expression;
  return node;
}

function rawJSON(node, ts) {
  node = unwrap(node, ts);
  if (ts.isConditionalExpression(node)) return rawJSON(node.whenTrue, ts) || rawJSON(node.whenFalse, ts);
  if (ts.isBinaryExpression(node) && [
    ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken,
  ].includes(node.operatorToken.kind)) return rawJSON(node.left, ts) || rawJSON(node.right, ts);
  if (!ts.isCallExpression(node)) return false;
  const property = access(node.expression, ts);
  return property && (property.name === 'json' ||
    (property.name === 'parse' && ts.isIdentifier(property.object) && property.object.text === 'JSON'));
}

function inspectSource(source, ts, emit) {
  const at = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  function walk(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      emit('EXPLICIT_ANY', 'P2', at(node), 'Review explicit any and its trust boundary');
    }
    if (ts.isNonNullExpression(node)) {
      emit('NON_NULL_ASSERTION', 'P3', at(node), 'Verify this non-null invariant');
    }
    if (ts.isCatchClause(node) && node.block.statements.length === 0) {
      emit('EMPTY_CATCH', 'P2', at(node), 'Check silently swallowed exception; a comment is not error handling');
    }
    if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && rawJSON(node.expression, ts)) {
      const isConst = ts.isTypeReferenceNode(node.type) && ts.isIdentifier(node.type.typeName) && node.type.typeName.text === 'const';
      if (!isConst) emit('UNVALIDATED_JSON_CAST', 'P2', at(node), 'Raw JSON assertion is not runtime validation; inspect the actual API and input');
    }
    if (ts.isPropertyAssignment(node) &&
        ['disableCSRFCheck', 'disableOriginCheck'].includes(memberName(node.name, ts)) &&
        unwrap(node.initializer, ts).kind === ts.SyntaxKind.TrueKeyword) {
      emit('AUTH_SECURITY_DISABLED', 'P2', at(node), 'Review whether this option reaches deployed authentication; the name alone proves no vulnerability');
    }
    if (ts.isCallExpression(node)) {
      const property = access(node.expression, ts);
      if (property && ts.isIdentifier(property.object) && property.object.text === 'Promise' && property.name === 'all' &&
          node.arguments.some((arg) => {
            arg = unwrap(arg, ts);
            const method = ts.isCallExpression(arg) && access(arg.expression, ts);
            return method && method.name === 'map';
          })) {
        emit('POTENTIALLY_UNBOUNDED_CONCURRENCY', 'P2', at(node), 'Check input size and concurrency limits; bounded maps are legitimate');
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(source);

  // Parser-established token boundaries avoid treating template tails, regex literals
  // and JSX text as comment trivia (a standalone scanner needs parser rescans).
  const comments = new Map();
  const jsxText = [];
  function add(ranges) {
    for (const range of ranges || []) comments.set(range.pos, range);
  }
  function trivia(node) {
    if (node.kind === ts.SyntaxKind.JsxText) {
      jsxText.push({ start: node.pos, end: node.end });
      return;
    }
    add(ts.getLeadingCommentRanges(source.text, node.pos));
    add(ts.getTrailingCommentRanges(source.text, node.end));
    for (const child of node.getChildren(source)) trivia(child);
  }
  trivia(source);
  for (const range of comments.values()) {
    if (jsxText.some((text) => range.pos >= text.start && range.pos < text.end)) continue;
    const text = source.text.slice(range.pos, range.end);
    // A mention in prose is not a directive. Match directive-shaped comment lines.
    if (/^(?:\/\/\/?|\/\*+)\s*@ts-(?:ignore|nocheck)\b/.test(text) ||
        /\n\s*\*\s*@ts-(?:ignore|nocheck)\b/.test(text)) {
      emit('TS_SUPPRESSION', 'P2', source.getLineAndCharacterOfPosition(range.pos).line + 1, 'Review suppressed type errors');
    }
  }
}

function hasBroadDenoPermission(command) {
  // Common direct task commands only: no shell evaluation, variables, task expansion or wrappers.
  const tokens = command.match(/"[^"]*"|'[^']*'|[^\s]+/g)?.map((token) => token.replace(/^(['"])(.*)\1$/, '$2')) || [];
  if (!/^(?:deno|deno\.exe)$/.test(tokens[0] || '') || !['run', 'test', 'serve', 'bench'].includes(tokens[1])) return false;
  for (let i = 2; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '--' || !token.startsWith('-')) return false;
    if (token === '-A' || token === '--allow-all') return true;
    if (['--config', '-c', '--import-map'].includes(token)) i++;
  }
  return false;
}

function inspectDeno(source, ts, emit) {
  const statement = source.statements[0];
  const object = statement && ts.isExpressionStatement(statement) && statement.expression;
  if (!object || !ts.isObjectLiteralExpression(object)) return;
  const tasks = object.properties.find((p) => ts.isPropertyAssignment(p) && memberName(p.name, ts) === 'tasks');
  if (!tasks || !ts.isObjectLiteralExpression(tasks.initializer)) return;
  for (const task of tasks.initializer.properties) {
    if (!ts.isPropertyAssignment(task)) continue;
    let command = task.initializer;
    if (ts.isObjectLiteralExpression(command)) {
      command = command.properties.find((p) => ts.isPropertyAssignment(p) && memberName(p.name, ts) === 'command')?.initializer;
    }
    if (command && ts.isStringLiteral(command) && hasBroadDenoPermission(command.text)) {
      emit('BROAD_DENO_PERMISSIONS', 'P2', source.getLineAndCharacterOfPosition(command.getStart(source)).line + 1,
        'Review broad permissions in this Deno task; trusted tooling may legitimately require them');
    }
  }
}

function audit(root, ts, options = {}) {
  compilerAPI(ts);
  root = fs.realpathSync(path.resolve(root));
  if (!fs.statSync(root).isDirectory()) throw Error('--root must be a directory');
  const maxFileBytes = options.maxFileBytes ?? MAX_FILE_BYTES;
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1) throw Error('maxFileBytes must be a positive integer');
  const inventory = collect(root, options);
  const report = {
    schemaVersion: 1, root, compilerVersion: ts.version, status: 'COMPLETE',
    filesDiscovered: inventory.files.length, filesInspected: 0, configsInspected: 0,
    testsExcluded: inventory.testsExcluded, skipped: inventory.skipped,
    diagnostics: [], disclaimer: DISCLAIMER, results: [],
  };
  function diagnose(code, file, message, line = 1) {
    report.diagnostics.push({ code, file: relative(root, file), line, message });
  }
  function inspect(file, config) {
    let source;
    try {
      if (fs.statSync(file).size > maxFileBytes) {
        diagnose('FILE_TOO_LARGE', file, 'File exceeds ' + maxFileBytes + ' bytes; audit is incomplete');
        return;
      }
      const text = fs.readFileSync(file, 'utf8');
      source = config ? ts.parseJsonText(file.split(path.sep).join('/'), text) :
        ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      if (source.parseDiagnostics.length) {
        for (const error of source.parseDiagnostics) diagnose(
          config ? 'CONFIG_PARSE_ERROR' : 'SOURCE_PARSE_ERROR', file,
          ts.flattenDiagnosticMessageText(error.messageText, '\n'),
          source.getLineAndCharacterOfPosition(error.start || 0).line + 1,
        );
        return;
      }
      const emit = (code, severity, line, detail) => report.results.push({
        code, severity, confidence: 'HEURISTIC', file: relative(root, file), line,
        scope: config ? 'config' : isTest(relative(root, file)) ? 'test' : 'source', detail,
      });
      if (config) {
        inspectDeno(source, ts, emit);
        report.configsInspected++;
      } else {
        inspectSource(source, ts, emit);
        report.filesInspected++;
      }
    } catch (error) {
      diagnose('FILE_INSPECTION_ERROR', file, error.message);
    }
  }
  for (const file of inventory.files) inspect(file, false);
  // Root Deno config is inspected independently of --path. Do not follow config symlinks.
  for (const name of ['deno.json', 'deno.jsonc']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    if (fs.lstatSync(file).isSymbolicLink()) diagnose('CONFIG_SYMLINK', file, 'Config symlink was not inspected');
    else inspect(file, true);
  }
  if (inventory.files.length === 0) diagnose('NO_SOURCE_FILES', root, 'No TypeScript source files in selected scope');
  if (report.diagnostics.length) report.status = 'INCOMPLETE';
  report.results.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));
  return report;
}

function scan(root, ts, options = {}) {
  const report = audit(root, ts, options);
  if (report.status !== 'COMPLETE') throw Error('Audit incomplete: ' + report.diagnostics.map((d) => d.file + ': ' + d.message).join('; '));
  return report.results;
}

function main(args = process.argv.slice(2)) {
  try {
    let root = '.', format = 'text', fail = false;
    const options = {};
    const value = (i) => {
      if (!args[i] || args[i].startsWith('--')) throw Error('Missing value for ' + args[i - 1]);
      return args[i];
    };
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--root') root = value(++i);
      else if (args[i] === '--format') format = value(++i);
      else if (args[i] === '--path') (options.paths ||= []).push(value(++i));
      else if (args[i] === '--exclude-tests') options.excludeTests = true;
      else if (args[i] === '--fail-on-signals') fail = true;
      else if (args[i] === '--help') {
        console.log('Usage: node ts-rails-audit.cjs --root DIR [--path FILE_OR_DIR] [--exclude-tests] [--format text|json] [--fail-on-signals]');
        return 0;
      } else throw Error('Unknown argument ' + args[i]);
    }
    if (!['text', 'json'].includes(format)) throw Error('Invalid format: ' + format);
    const report = audit(root, getTS(root), options);
    if (format === 'json') console.log(JSON.stringify(report, null, 2));
    else {
      console.log(report.status + ': ' + report.filesInspected + '/' + report.filesDiscovered + ' source files, ' +
        report.configsInspected + ' configs, ' + report.testsExcluded + ' tests excluded; ' + report.results.length + ' signals');
      console.log(DISCLAIMER);
      for (const finding of report.results) {
        console.log(finding.severity + ' ' + finding.code + ' [' + finding.scope + '] ' + finding.file + ':' + finding.line + ' — ' + finding.detail);
      }
      for (const diagnostic of report.diagnostics) console.log(diagnostic.code + ' ' + diagnostic.file + ':' + diagnostic.line + ' — ' + diagnostic.message);
    }
    return report.status === 'INCOMPLETE' ? 1 : fail && report.results.length ? 2 : 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (require.main === module) process.exitCode = main();
module.exports = { getTS, scan, audit, files };
