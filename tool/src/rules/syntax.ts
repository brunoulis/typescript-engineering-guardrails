import type * as ts from 'typescript';
import type { Compiler, Emit } from '../types/report.js';
import type { SemanticRules } from './typed.js';
export function memberName(node: ts.Node, ts: Compiler): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  if (ts.isComputedPropertyName(node) && ts.isStringLiteral(node.expression)) return node.expression.text;
  return undefined;
}

export function access(node: ts.Node, ts: Compiler): { object: ts.Expression; name: string } | undefined {
  if (ts.isPropertyAccessExpression(node)) return { object: node.expression, name: node.name.text };
  if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) {
    return { object: node.expression, name: node.argumentExpression.text };
  }
  return undefined;
}

export function unwrap(node: ts.Expression, ts: Compiler): ts.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isAwaitExpression(node)) node = node.expression;
  return node;
}

function rawJSON(node: ts.Expression, ts: Compiler): boolean {
  node = unwrap(node, ts);
  if (ts.isConditionalExpression(node)) return rawJSON(node.whenTrue, ts) || rawJSON(node.whenFalse, ts);
  if (ts.isBinaryExpression(node) && [
    ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken,
  ].includes(node.operatorToken.kind)) return rawJSON(node.left, ts) || rawJSON(node.right, ts);
  if (!ts.isCallExpression(node)) return false;
  const property = access(node.expression, ts);
  return !!property && (property.name === 'json' ||
    (property.name === 'parse' && ts.isIdentifier(property.object) && property.object.text === 'JSON'));
}

export function inspectSource(source: ts.SourceFile, ts: Compiler, emit: Emit, semantic?: SemanticRules) {
  const at = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  function walk(node: ts.Node, inFinally = false): void {
    if (inFinally && ts.isReturnStatement(node)) {
      emit('RETURN_IN_FINALLY', 'P2', at(node), 'Returning from finally can replace a pending error or return value; check the exceptional path');
    }
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      emit('EXPLICIT_ANY', 'P2', at(node), 'Review explicit any and its trust boundary');
    }
    if (ts.isNonNullExpression(node)) {
      emit('NON_NULL_ASSERTION', 'P3', at(node), 'Verify this non-null invariant');
    }
    if (ts.isCatchClause(node) && node.block.statements.length === 0) {
      emit('EMPTY_CATCH', 'P2', at(node), 'Check silently swallowed exception; a comment is not error handling');
    }
    if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && (semantic ? semantic.rawJSON(node.expression) : rawJSON(node.expression, ts))) {
      const isConst = ts.isTypeReferenceNode(node.type) && ts.isIdentifier(node.type.typeName) && node.type.typeName.text === 'const';
      if (!isConst) emit('UNVALIDATED_JSON_CAST', 'P2', at(node), 'Raw JSON assertion is not runtime validation; inspect the actual API and input');
    }
    if (ts.isPropertyAssignment(node) &&
        ['disableCSRFCheck', 'disableOriginCheck'].includes(memberName(node.name, ts) ?? '') &&
        unwrap(node.initializer, ts).kind === ts.SyntaxKind.TrueKeyword) {
      emit('AUTH_SECURITY_DISABLED', 'P2', at(node), 'Review whether this option reaches deployed authentication; the name alone proves no vulnerability');
    }
    if (ts.isCallExpression(node)) {
      const property = access(node.expression, ts);
      if (semantic ? semantic.unbounded(node) : property && ts.isIdentifier(property.object) && property.object.text === 'Promise' && property.name === 'all' &&
          node.arguments.some((arg) => {
            arg = unwrap(arg, ts);
            const method = ts.isCallExpression(arg) && access(arg.expression, ts);
            return method && method.name === 'map';
          })) {
        emit('POTENTIALLY_UNBOUNDED_CONCURRENCY', 'P2', at(node), 'Check input size and concurrency limits; bounded maps are legitimate');
      }
    }
    if (ts.isAwaitExpression(node) && semantic?.asyncForEach(node)) {
      emit('AWAIT_ASYNC_FOREACH', 'P2', at(node), 'Array.forEach discards callback promises. Await each operation or join the work with the required concurrency limit.');
    }
    const cleanup = ts.isTryStatement(node) ? node.finallyBlock : undefined;
    const enclosingCleanup = inFinally && !ts.isFunctionLike(node);
    ts.forEachChild(node, (child) => walk(child, enclosingCleanup || child === cleanup));
  }
  walk(source);

  // Parser-established token boundaries avoid treating template tails, regex literals
  // and JSX text as comment trivia (a standalone scanner needs parser rescans).
  const comments = new Map<number, ts.CommentRange>();
  const jsxText: { start: number; end: number }[] = [];
  function add(ranges: ts.CommentRange[] | undefined): void {
    for (const range of ranges || []) comments.set(range.pos, range);
  }
  function trivia(node: ts.Node): void {
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

function hasBroadDenoPermission(command: string): boolean {
  // Common direct task commands only: no shell evaluation, variables, task expansion or wrappers.
  const tokens = command.match(/"[^"]*"|'[^']*'|[^\s]+/g)?.map((token) => token.replace(/^(['"])(.*)\1$/, '$2')) || [];
  if (!/^(?:deno|deno\.exe)$/.test(tokens[0] || '') || !['run', 'test', 'serve', 'bench'].includes(tokens[1] ?? '')) return false;
  for (let i = 2; i < tokens.length; i++) {
    const token = tokens[i]; if (!token) continue;
    if (token === '--' || !token.startsWith('-')) return false;
    if (token === '-A' || token === '--allow-all') return true;
    if (['--config', '-c', '--import-map'].includes(token)) i++;
  }
  return false;
}

export function inspectDeno(source: ts.SourceFile, ts: Compiler, emit: Emit) {
  const statement = source.statements[0];
  const object = statement && ts.isExpressionStatement(statement) && statement.expression;
  if (!object || !ts.isObjectLiteralExpression(object)) return;
  const tasks = object.properties.find((p) => ts.isPropertyAssignment(p) && memberName(p.name, ts) === 'tasks');
  if (!tasks || !ts.isPropertyAssignment(tasks) || !ts.isObjectLiteralExpression(tasks.initializer)) return;
  for (const task of tasks.initializer.properties) {
    if (!ts.isPropertyAssignment(task)) continue;
    let command: ts.Expression | undefined = task.initializer;
    if (ts.isObjectLiteralExpression(command)) {
      const property = command.properties.find((p) => ts.isPropertyAssignment(p) && memberName(p.name, ts) === 'command');
      command = property && ts.isPropertyAssignment(property) ? property.initializer : undefined;
    }
    if (command && ts.isStringLiteral(command) && hasBroadDenoPermission(command.text)) {
      emit('BROAD_DENO_PERMISSIONS', 'P2', source.getLineAndCharacterOfPosition(command.getStart(source)).line + 1,
        'Review broad permissions in this Deno task; trusted tooling may legitimately require them');
    }
  }
}

