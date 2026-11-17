import type * as ts from 'typescript';
import type { Compiler, Emit } from '../types/report.js';
import { access, memberName, unwrap } from './syntax.js';

interface Binding {
  module?: string;
  imported?: string;
  typeOnly?: boolean;
  value?: ts.Expression;
  parameter?: ts.ParameterDeclaration;
}
interface LexicalScope { parent: LexicalScope | undefined; bindings: Map<string, Binding | null>; functionScope: boolean }

/** Local import/binding evidence only. This is deliberately not an interprocedural SQL or authorization analyzer. */
export function inspectFrameworks(source: ts.SourceFile, ts: Compiler, emit: Emit): void {
  const scopes = new Map<ts.Node, LexicalScope>();
  const root: LexicalScope = { parent: undefined, bindings: new Map(), functionScope:true };
  function bind(scope: LexicalScope, name: ts.BindingName, binding: Binding): void {
    if (ts.isIdentifier(name)) {
      scope.bindings.set(name.text, scope.bindings.has(name.text) ? null : binding);
    } else for (const element of name.elements) if (ts.isBindingElement(element)) bind(scope, element.name, binding);
  }
  function index(node: ts.Node, enclosing: LexicalScope): void {
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isTypeAliasDeclaration(node)
      || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node)) && node.name) bind(enclosing,node.name,{});
    const scoped = ts.isFunctionLike(node) || ts.isBlock(node) || ts.isCatchClause(node)
      || ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isClassExpression(node);
    const scope:LexicalScope = scoped ? {parent:enclosing,bindings:new Map<string, Binding | null>(),functionScope:ts.isFunctionLike(node)} : enclosing;
    scopes.set(node,scope);
    if ((ts.isFunctionExpression(node) || ts.isClassExpression(node)) && node.name) bind(scope,node.name,{});
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause) {
      const clause = node.importClause;
      const module = node.moduleSpecifier.text;
      if (clause.name) bind(scope,clause.name,{module,imported:'default',typeOnly:clause.isTypeOnly});
      const named = clause.namedBindings;
      if (named && ts.isNamespaceImport(named)) bind(scope,named.name,{module,imported:'*',typeOnly:clause.isTypeOnly});
      if (named && ts.isNamedImports(named)) for (const element of named.elements) {
        bind(scope,element.name,{module,imported:(element.propertyName ?? element.name).text,typeOnly:clause.isTypeOnly || element.isTypeOnly});
      }
    }
    if (ts.isVariableDeclaration(node)) {
      const binding: Binding = {};
      if (ts.isIdentifier(node.name) && node.initializer && ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const)) binding.value=node.initializer;
      let declarationScope=scope;
      if (ts.isVariableDeclarationList(node.parent) && !(node.parent.flags & ts.NodeFlags.BlockScoped)) {
        while (!declarationScope.functionScope && declarationScope.parent) declarationScope=declarationScope.parent;
      }
      bind(declarationScope,node.name,binding);
    }
    if (ts.isParameter(node)) bind(scope,node.name,{parameter:node});
    ts.forEachChild(node,child=>index(child,scope));
  }
  index(source,root);
  function binding(identifier: ts.Identifier): Binding | undefined {
    let scope = scopes.get(identifier);
    while (scope) {
      if (scope.bindings.has(identifier.text)) return scope.bindings.get(identifier.text) ?? undefined;
      scope=scope.parent;
    }
    return undefined;
  }
  function imported(expression: ts.Expression, module: (value:string)=>boolean, name:string, allowType=false, depth=0): boolean {
    if (depth>8) return false;
    expression=unwrap(expression,ts);
    if (ts.isIdentifier(expression)) {
      const resolved=binding(expression);
      if (resolved?.module && resolved.imported===name && (allowType || !resolved.typeOnly)) return module(resolved.module);
      return !!resolved?.value && imported(resolved.value,module,name,allowType,depth+1);
    }
    const property=access(expression,ts);
    if (!property || property.name!==name || !ts.isIdentifier(property.object)) return false;
    const resolved=binding(property.object);
    return !!resolved?.module && ['*','default'].includes(resolved.imported ?? '') && (allowType || !resolved.typeOnly) && module(resolved.module);
  }
  function callbackParameter(parameter: ts.ParameterDeclaration, method: string, receiver: (value:ts.Expression,depth:number)=>boolean, depth:number): boolean {
    const fn=parameter.parent;
    if ((!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) || fn.parameters[0]!==parameter || !ts.isCallExpression(fn.parent)) return false;
    const call=fn.parent;
    const property=access(call.expression,ts);
    return !!property && property.name===method && receiver(property.object,depth+1);
  }
  function drizzleDatabase(expression:ts.Expression,depth=0):boolean {
    if (depth>8) return false;
    expression=unwrap(expression,ts);
    if (ts.isCallExpression(expression)) return imported(expression.expression,module=>module.startsWith('drizzle-orm/'),'drizzle');
    if (!ts.isIdentifier(expression)) return false;
    const resolved=binding(expression);
    if (resolved?.value) return drizzleDatabase(resolved.value,depth+1);
    return !!resolved?.parameter && callbackParameter(resolved.parameter,'transaction',drizzleDatabase,depth);
  }
  function pgPool(expression:ts.Expression,depth=0):boolean {
    if (depth>8) return false;
    expression=unwrap(expression,ts);
    if (ts.isNewExpression(expression)) return imported(expression.expression,module=>module==='pg','Pool');
    if (!ts.isIdentifier(expression)) return false;
    const resolved=binding(expression);
    return !!resolved?.value && pgPool(resolved.value,depth+1);
  }
  function honoApplication(expression:ts.Expression,depth=0):boolean {
    if (depth>8) return false;
    expression=unwrap(expression,ts);
    if (ts.isNewExpression(expression)) return imported(expression.expression,module=>module==='hono','Hono');
    if (ts.isCallExpression(expression)) {
      const property=access(expression.expression,ts);
      return !!property && ['get','post','put','patch','delete','options','query','all','use','on','basePath','route','notFound','onError'].includes(property.name)
        && honoApplication(property.object,depth+1);
    }
    if (!ts.isIdentifier(expression)) return false;
    const resolved=binding(expression);
    return !!resolved?.value && honoApplication(resolved.value,depth+1);
  }
  function honoContext(expression:ts.Expression):boolean {
    if (!ts.isIdentifier(expression)) return false;
    const parameter=binding(expression)?.parameter;
    if (!parameter) return false;
    if (parameter.type && ts.isTypeReferenceNode(parameter.type) && ts.isIdentifier(parameter.type.typeName)
      && imported(parameter.type.typeName,module=>module==='hono','Context',true)) return true;
    return ['get','post','put','patch','delete','options','all','use','on'].some(method=>callbackParameter(parameter,method,honoApplication,0));
  }
  function webRequest(expression:ts.Expression):boolean {
    if (!ts.isIdentifier(expression)) return false;
    const type=binding(expression)?.parameter?.type;
    return !!type && ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)
      && type.typeName.text==='Request' && !binding(type.typeName);
  }
  function rawRequest(expression:ts.Expression,depth=0):boolean {
    if (depth>8) return false;
    expression=unwrap(expression,ts);
    if (ts.isIdentifier(expression)) {
      const resolved=binding(expression);
      return !!resolved?.value && rawRequest(resolved.value,depth+1);
    }
    if (!ts.isCallExpression(expression)) return false;
    const json=access(expression.expression,ts);
    if (!json || json.name!=='json') return false;
    if (webRequest(json.object)) return true;
    const req=access(json.object,ts);
    return !!req && req.name==='req' && honoContext(req.object);
  }
  const at=(node:ts.Node):number=>source.getLineAndCharacterOfPosition(node.getStart(source)).line+1;
  function authOptions(node:ts.Node):void {
    if (!ts.isObjectLiteralExpression(node)) return;
    const advanced=node.properties.find(property=>ts.isPropertyAssignment(property) && memberName(property.name,ts)==='advanced');
    if (!advanced || !ts.isPropertyAssignment(advanced)) return;
    const options=unwrap(advanced.initializer,ts);
    if (!ts.isObjectLiteralExpression(options)) return;
    for (const property of options.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      if (['disableCSRFCheck','disableOriginCheck'].includes(memberName(property.name,ts) ?? '') && unwrap(property.initializer,ts).kind===ts.SyntaxKind.TrueKeyword) {
        emit('BETTER_AUTH_SECURITY_DISABLED','P2',at(property),'Imported betterAuth receives a literal disabled security option; verify deployed configuration and version-specific semantics');
      }
    }
  }
  function transactionStart(node:ts.Expression):boolean {
    node=unwrap(node,ts);
    if (ts.isObjectLiteralExpression(node)) {
      const text=node.properties.find(property=>ts.isPropertyAssignment(property) && memberName(property.name,ts)==='text');
      return !!text && ts.isPropertyAssignment(text) && transactionStart(text.initializer);
    }
    if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) return false;
    // Only the initial BEGIN token is recognized. Comments and subsequent SQL syntax are not parsed.
    return /^\s*BEGIN(?:\s|;|$)/i.test(node.text);
  }
  function walk(node:ts.Node):void {
    if (ts.isCallExpression(node)) {
      if (imported(node.expression,module=>module==='better-auth' || module==='better-auth/minimal','betterAuth')) {
        const options=node.arguments[0]; if (options) authOptions(unwrap(options,ts));
      }
      const property=access(node.expression,ts);
      if (property?.name==='query' && pgPool(property.object) && node.arguments[0] && transactionStart(node.arguments[0])) {
        emit('PG_POOL_TRANSACTION','P2',at(node),'Imported pg Pool.query starts a transaction without reserving one client; review BEGIN/statements/COMMIT on a single acquired client');
      }
      let expression:ts.Expression=node;
      while (ts.isParenthesizedExpression(expression.parent)) expression=expression.parent;
      const parent=expression.parent;
      const inner=(ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression===expression
        && ts.isCallExpression(parent.parent) && parent.parent.expression===parent;
      if (!inner) {
        const chain:{name:string;call:ts.CallExpression}[]=[];
        let receiver:ts.Expression=node;
        while (ts.isCallExpression(receiver)) {
          const part=access(receiver.expression,ts); if (!part) break;
          chain.push({name:part.name,call:receiver}); receiver=unwrap(part.object,ts);
        }
        const mutation=chain[chain.length-1];
        if (mutation && (mutation.name==='update' || mutation.name==='delete') && drizzleDatabase(receiver)) {
          if (!chain.some(part=>part.name==='where')) emit('DRIZZLE_MUTATION_WITHOUT_WHERE','P2',at(node),'Imported Drizzle database mutation has no visible where in this chain; bulk operations/wrappers may be legitimate');
          const set=chain.find(part=>part.name==='set');
          if (set?.call.arguments[0] && rawRequest(set.call.arguments[0])) emit('DRIZZLE_RAW_REQUEST_SET','P2',at(set.call),'Drizzle set receives direct HTTP JSON or its immutable local alias; validate and allowlist mutable fields before persistence');
        }
      }
    }
    ts.forEachChild(node,walk);
  }
  walk(source);
}
