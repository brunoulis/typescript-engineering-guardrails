import type * as ts from 'typescript';
import type { Compiler, Emit } from '../types/report.js';
import { access, memberName, unwrap } from './syntax.js';

const SQL_METHODS = new Set(['execute', 'executeMany', 'query', 'queryStream']);
// Static text must look like a statement; this keeps Hono's req.query("name") and similar calls out.
const SQL_SHAPE = /\b(?:SELECT|INSERT|UPDATE|DELETE|MERGE)\b[\s\S]*\b(?:FROM|INTO|SET|VALUES|USING)\b|\bBEGIN\b[\s\S]*\bEND\b/i;
const IDENTIFIER_POSITION = /\b(?:ORDER\s+BY|GROUP\s+BY|FROM|JOIN|INTO|UPDATE|TABLE)\s*$/i;
const MAX_DEPTH = 6;

type Part = { literal: string } | { expression: ts.Expression };

/**
 * Local evidence only: SQL text passed to execute/executeMany/query/queryStream that interpolates something
 * which is not a constant of the same file. It does not follow imports, wrappers or data flow, and it is not
 * proof of injection; bind variables cannot parameterize identifiers, so those get their own code.
 * shortcut: file-wide name table (shadowed names are dropped), exact scoping needs the type checker.
 */
export function inspectSql(source: ts.SourceFile, ts: Compiler, emit: Emit): void {
  const at = (node: ts.Node): number => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const declared = new Map<string, ts.Expression | null>();
  function collect(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const constant = ts.isVariableDeclarationList(node.parent) && !!(node.parent.flags & ts.NodeFlags.Const) && !!node.initializer;
      declared.set(node.name.text, constant && !declared.has(node.name.text) ? node.initializer! : null);
    } else if ((ts.isParameter(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
      declared.set(node.name.text, null);
    }
    ts.forEachChild(node, collect);
  }
  collect(source);

  function parts(expression: ts.Expression, out: Part[] = []): Part[] {
    expression = unwrap(expression, ts);
    if (ts.isStringLiteralLike(expression)) out.push({ literal: expression.text });
    else if (ts.isTemplateExpression(expression)) {
      out.push({ literal: expression.head.text });
      for (const span of expression.templateSpans) { out.push({ expression: span.expression }); out.push({ literal: span.literal.text }); }
    } else if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      parts(expression.left, out); parts(expression.right, out);
    } else out.push({ expression });
    return out;
  }
  function cleared(expression: ts.Expression, depth: number): boolean {
    expression = unwrap(expression, ts);
    if (ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression)) return true;
    if (ts.isTemplateExpression(expression)) return expression.templateSpans.every(span => cleared(span.expression, depth + 1));
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) return cleared(expression.left, depth + 1) && cleared(expression.right, depth + 1);
    if (ts.isIdentifier(expression) && depth < MAX_DEPTH) {
      const value = declared.get(expression.text);
      return !!value && cleared(value, depth + 1);
    }
    return false;
  }
  function sqlArgument(argument: ts.Expression): ts.Expression {
    argument = unwrap(argument, ts);
    if (ts.isObjectLiteralExpression(argument)) {
      const text = argument.properties.find(property => ts.isPropertyAssignment(property) && memberName(property.name, ts) === 'text');
      if (text && ts.isPropertyAssignment(text)) return unwrap(text.initializer, ts);
    }
    if (ts.isIdentifier(argument)) return declared.get(argument.text) ?? argument;
    return argument;
  }
  function walk(node: ts.Node): void {
    if (ts.isCallExpression(node) && node.arguments[0]) {
      const method = access(node.expression, ts);
      if (method && SQL_METHODS.has(method.name)) {
        const list = parts(sqlArgument(node.arguments[0]));
        const text = list.map(part => 'literal' in part ? part.literal : ' ').join('');
        if (list.some(part => 'expression' in part) && SQL_SHAPE.test(text)) {
          let before = '';
          for (const part of list) {
            if ('literal' in part) { before += part.literal; continue; }
            // :${n} and $${n} build a numbered bind placeholder, which cannot carry SQL.
            if (/[:$]$/.test(before) || cleared(part.expression, 0)) { before += ' '; continue; }
            const shown = part.expression.getText(source).replace(/\s+/g, ' ').slice(0, 40);
            if (IDENTIFIER_POSITION.test(before)) emit('SQL_DYNAMIC_IDENTIFIER', 'P2', at(part.expression), `SQL interpolates "${shown}" where an identifier or clause belongs; bind variables cannot protect it, so verify a fixed allowlist`);
            else emit('SQL_STRING_INTERPOLATION', 'P2', at(part.expression), `SQL interpolates the non-constant expression "${shown}"; pass values as bind variables or prove it is a fixed fragment`);
            before += ' ';
          }
        }
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
}
