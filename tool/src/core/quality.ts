import type * as ts from 'typescript';
import type { Compiler, AuditOptions, AuditReport, Edge, Dimension } from '../types/report.js';
import { isTest, relative } from './project-discovery.js';

type FunctionBody = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration | ts.ConstructorDeclaration;
function isFunction(node: ts.Node, ts: Compiler): node is FunctionBody {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node);
}

function complexity(body: ts.Node, ts: Compiler): number {
  let decisions = 1;
  const visit = (node: ts.Node): void => {
    if (isFunction(node, ts)) return;
    if (ts.isIfStatement(node) || ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isCaseClause(node) || ts.isCatchClause(node) || ts.isConditionalExpression(node)) decisions++;
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) decisions++;
    ts.forEachChild(node, visit);
  };
  visit(body); return decisions;
}

/** Normalize only unambiguous local bindings; keep literals, property keys and callees. */
function normalizedBody(fn: FunctionBody, source: ts.SourceFile, ts: Compiler): { key: string; tokens: number } | undefined {
  if (!fn.body) return undefined;
  const bindings = new Map<string, string>(); let ambiguous = false;
  const bind = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) {
      if (bindings.has(name.text)) ambiguous = true;
      else bindings.set(name.text, `$local${bindings.size}`);
    } else for (const element of name.elements) if (ts.isBindingElement(element)) bind(element.name);
  };
  for (const parameter of fn.parameters) bind(parameter.name);
  const collect = (node: ts.Node): void => {
    if (isFunction(node, ts)) return;
    if (ts.isVariableDeclaration(node)) bind(node.name);
    ts.forEachChild(node, collect);
  };
  collect(fn.body);
  if (ambiguous) return undefined;
  const replacements = new Map<number, string>();
  const visit = (node: ts.Node): void => {
    if (node !== fn.body && isFunction(node, ts)) return;
    if (ts.isTypeNode(node)) return;
    if (ts.isIdentifier(node) && bindings.has(node.text)) {
      const parent = node.parent;
      const property = (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node) ||
        (ts.isBindingElement(parent) && (parent.propertyName === node || (!parent.propertyName && ts.isObjectBindingPattern(parent.parent)))) || ts.isShorthandPropertyAssignment(parent);
      const callee = (ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.expression === node;
      if (!property && !callee) replacements.set(node.getStart(source), bindings.get(node.text)!);
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  const tokens: string[] = [];
  // Parser-established leaves preserve regex/template/JSX boundaries that a standalone scanner cannot infer.
  const tokenize = (node: ts.Node): void => {
    if (ts.isJSDoc(node)) return;
    const children = node.getChildren(source);
    if (children.length) for (const child of children) tokenize(child);
    else if (node.kind !== ts.SyntaxKind.SyntaxList) tokens.push(replacements.get(node.getStart(source)) ?? node.getText(source));
  };
  tokenize(fn.body);
  return { key: JSON.stringify(tokens), tokens: tokens.length };
}

function delegatesOnly(node: ts.ClassDeclaration | ts.ClassExpression, ts: Compiler): boolean {
  // Explicit inheritance is a contract; this signal never judges whether it is useful.
  if (node.heritageClauses?.length) return false;
  const methods = node.members.filter(ts.isMethodDeclaration);
  if (methods.length < 2) return false;
  for (const member of node.members) {
    if (ts.isMethodDeclaration(member)) continue;
    if (ts.isPropertyDeclaration(member) && !member.initializer) continue;
    if (ts.isConstructorDeclaration(member) && member.body && member.body.statements.every(statement => {
      if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)) return false;
      const assignment = statement.expression;
      return assignment.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(assignment.left) && assignment.left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(assignment.right) && member.parameters.some(parameter => ts.isIdentifier(parameter.name) && parameter.name.text === assignment.right.getText());
    })) continue;
    return false;
  }
  return methods.every(method => {
    if (!method.body || method.body.statements.length !== 1 || method.typeParameters?.length) return false;
    const statement = method.body.statements[0];
    const expression = statement && (ts.isReturnStatement(statement) ? statement.expression : ts.isExpressionStatement(statement) ? statement.expression : undefined);
    if (!expression || !ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) return false;
    const receiver = expression.expression.expression;
    if (!ts.isPropertyAccessExpression(receiver) || receiver.expression.kind !== ts.SyntaxKind.ThisKeyword) return false;
    return method.parameters.length === expression.arguments.length && method.parameters.every((parameter, index) => {
      const argument = expression.arguments[index];
      return !parameter.initializer && !parameter.dotDotDotToken && ts.isIdentifier(parameter.name) && argument && ts.isIdentifier(argument) && parameter.name.text === argument.text;
    });
  });
}

function dimension(evidence: Dimension['evidence'], evaluated: boolean, note: string): Dimension {
  return { grade: !evaluated ? null : evidence.length === 0 ? 3 : evidence.length < 3 ? 2 : evidence.length < 10 ? 1 : 0, evidence, note };
}

export function analyzeQuality(root: string, ts: Compiler, sources: Map<string, ts.SourceFile>, options: AuditOptions, report: AuditReport, edges: Edge[]): void {
  if (!options.score) return;
  const enabled = (code: string): boolean => options.rules?.[code] !== false;
  const clones = new Map<string, { file: string; line: number }>();
  const emit = (code: string, file: string, node: ts.Node, source: ts.SourceFile, detail: string): void => {
    if (enabled(code)) report.results.push({ code, severity: 'P3', confidence: 'HEURISTIC', file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, scope: isTest(file) ? 'test' : 'source', detail });
  };
  for (const [file, source] of [...sources].sort(([a], [b]) => a.localeCompare(b))) {
    const name = relative(root, file);
    const visit = (node: ts.Node): void => {
      if (isFunction(node, ts) && node.body) {
        const value = complexity(node.body, ts);
        if (value > (options.complexityLimit ?? 15)) emit('HIGH_COMPLEXITY', name, node, source, `Cyclomatic complexity ${value} exceeds ${options.complexityLimit ?? 15}; decisions are counted within this function only. Review behavioral tests and possible simplification.`);
        const normalized = normalizedBody(node, source, ts);
        if (normalized && normalized.tokens >= (options.cloneMinTokens ?? 60)) {
          const original = clones.get(normalized.key);
          if (original) emit('DUPLICATE_BODY', name, node, source, `Body matches ${original.file}:${original.line} after conservative local-binding normalization (${normalized.tokens} tokens); literals, callees and properties are retained. Similarity may be intentional.`);
          else clones.set(normalized.key, { file: name, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
        }
      }
      if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && delegatesOnly(node, ts)) emit('DELEGATING_LAYER', name, node, source, 'Class has at least two forwarding methods and no explicit inheritance contract or method argument transformations. Adapters and instrumentation boundaries can be legitimate; review ownership and purpose.');
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const complete = report.status === 'COMPLETE' && report.diagnostics.length === 0;
  const evidence = (codes: string[]): Dimension['evidence'] => report.results.filter(f => codes.includes(f.code)).map(({ file, line, detail }) => ({ file, line, detail }));
  const reachable = new Set<string>(); const adjacency = new Map<string, string[]>();
  for (const edge of edges) if (!edge.typeOnly) { const targets = adjacency.get(edge.from) ?? []; targets.push(edge.to); adjacency.set(edge.from, targets); }
  const pending = [...sources.keys()].map(file => relative(root, file)).filter(isTest);
  while (pending.length) {
    const name = pending.pop()!;
    if (reachable.has(name)) continue;
    reachable.add(name); pending.push(...(adjacency.get(name) ?? []));
  }
  const testsInScope = !options.excludeTests && !options.paths?.length;
  const missing = testsInScope ? [...sources.keys()].map(file => relative(root, file)).filter(file => !isTest(file) && !reachable.has(file)).sort().map(file => ({ file, line: 1, detail: 'No runtime import/reexport path from a selected test file was found.' })) : [];
  report.score = { version: 1, dimensions: {
    duplication: dimension(evidence(['DUPLICATE_BODY']), complete && enabled('DUPLICATE_BODY'), 'Selected function bodies only; conservative local-binding normalization; this does not prove shared behavior.'),
    complexity: dimension(evidence(['HIGH_COMPLEXITY']), complete && enabled('HIGH_COMPLEXITY'), 'Per-function syntactic cyclomatic decisions; nested functions counted independently.'),
    coupling: dimension(evidence(['DEPENDENCY_CYCLE', 'FORBIDDEN_DEPENDENCY']), complete && (enabled('DEPENDENCY_CYCLE') || (enabled('FORBIDDEN_DEPENDENCY') && !!options.boundaries?.length)), 'Concrete runtime import cycles and explicitly configured boundaries; no general architecture quality claim.'),
    'useless-layers': dimension(evidence(['DELEGATING_LAYER']), complete && enabled('DELEGATING_LAYER'), 'Forwarding classes without an explicit inheritance contract are review signals, not proof of unnecessary architecture.'),
    tests: dimension(missing, complete && testsInScope, 'Runtime import/reexport reachability from selected tests only; this is not test coverage or evidence of assertions, execution, or behavioral relevance. Narrow paths or excluded tests leave this dimension unevaluated with no missing-test evidence.'),
  } };
}
