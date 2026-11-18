import type * as ts from 'typescript';
import type { Compiler } from '../types/report.js';
import { access, unwrap } from './syntax.js';

export interface SemanticRules {
  rawJSON(node: ts.Expression): boolean;
  unbounded(node: ts.CallExpression): boolean;
  asyncForEach(node: ts.AwaitExpression): boolean;
}
export function semanticRules(ts: Compiler, checker: ts.TypeChecker, program: ts.Program, limit = 16): SemanticRules {
  function builtin(call: ts.CallExpression, owner: string, method: string): boolean {
    const declaration = checker.getResolvedSignature(call)?.declaration;
    if (!declaration || !program.isSourceFileDefaultLibrary(declaration.getSourceFile())) return false;
    const parent = declaration.parent;
    return ts.isInterfaceDeclaration(parent) && parent.name.text === owner &&
      'name' in declaration && !!declaration.name && declaration.name.getText() === method;
  }
  function rawJSON(expression: ts.Expression): boolean {
    const node = unwrap(expression, ts);
    if (ts.isConditionalExpression(node)) return rawJSON(node.whenTrue) || rawJSON(node.whenFalse);
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(node.operatorToken.kind)) return rawJSON(node.left) || rawJSON(node.right);
    if (!ts.isCallExpression(node)) return false;
    return builtin(node, 'JSON', 'parse') || builtin(node, 'Body', 'json') || nodeBodyJSON(node);
  }
  function nodeBodyJSON(call: ts.CallExpression): boolean {
    // @types/node24 delegates Fetch bodies to undici-types7's BodyMixin.json
    // function-valued property. Static Response.json serializes and is excluded.
    const declaration = checker.getResolvedSignature(call)?.declaration;
    if (!declaration || !ts.isFunctionTypeNode(declaration)) return false;
    const property = declaration.parent;
    return ts.isPropertyDeclaration(property) && property.name.getText() === 'json' &&
      ts.isClassDeclaration(property.parent) && property.parent.name?.text === 'BodyMixin' &&
      /\/node_modules\/undici-types\/fetch\.d\.ts$/.test(declaration.getSourceFile().fileName.replaceAll('\\', '/'));
  }
  function promiseAll(node: ts.CallExpression): boolean {
    if (builtin(node, 'PromiseConstructor', 'all')) return true;
    // bind() aliases lose their original overload declaration; follow a const initializer only.
    let callee: ts.Expression = node.expression;
    if (ts.isIdentifier(callee)) {
      const declarations = checker.getSymbolAtLocation(callee)?.declarations;
      const variable = declarations?.find(ts.isVariableDeclaration);
      if (variable?.initializer && ts.isVariableDeclarationList(variable.parent) && (variable.parent.flags & ts.NodeFlags.Const)) callee = variable.initializer;
    }
    if (ts.isCallExpression(callee)) {
      const bound = access(callee.expression, ts);
      if (bound?.name === 'bind') {
        const declaration = checker.getSymbolAtLocation(bound.object)?.declarations?.[0];
        return !!declaration && program.isSourceFileDefaultLibrary(declaration.getSourceFile()) &&
          ts.isMethodSignature(declaration) && declaration.name.getText() === 'all' &&
          ts.isInterfaceDeclaration(declaration.parent) && declaration.parent.name.text === 'PromiseConstructor';
      }
    }
    return false;
  }
  function asyncForEach(node: ts.AwaitExpression): boolean {
    let call: ts.Expression = node.expression;
    while (ts.isParenthesizedExpression(call)) call = call.expression;
    if (!ts.isCallExpression(call) || access(call.expression, ts)?.name !== 'forEach') return false;
    if (!builtin(call, 'Array', 'forEach') && !builtin(call, 'ReadonlyArray', 'forEach')) return false;
    const callback = call.arguments[0];
    if (!callback) return false;
    const signatures = checker.getTypeAtLocation(callback).getCallSignatures();
    return signatures.length > 0 && signatures.every(signature => {
      const result = checker.getReturnTypeOfSignature(signature);
      return (result.isUnion() ? result.types : [result]).every(type => {
        const awaited = checker.getAwaitedType(type);
        return !!type.getProperty('then') && !!awaited && awaited !== type;
      });
    });
  }
  return { rawJSON, asyncForEach, unbounded(node) {
    if (!promiseAll(node)) return false;
    return node.arguments.some(arg => {
      arg = unwrap(arg, ts);
      if (!ts.isCallExpression(arg)) return false;
      const method = access(arg.expression, ts);
      if (!method || method.name !== 'map') return false;
      const type = checker.getTypeAtLocation(method.object);
      if (checker.isTupleType(type)) {
        const tuple = type as ts.TypeReference;
        const target = tuple.target as ts.TupleType;
        const bounded = !target.elementFlags.some(flag => flag & (ts.ElementFlags.Rest | ts.ElementFlags.Variadic));
        if (bounded && checker.getTypeArguments(tuple).length <= limit) return false;
      }
      return true;
    });
  } };
}
