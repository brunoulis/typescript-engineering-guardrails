# Quality dimensions and dependency evidence

Run `node scripts/ts-rails-audit.cjs --root PROJECT --score --format json` after building the auditor. `--mode typed --project tsconfig.json` adds compiler-resolved module context; relative project paths resolve from --root. The default syntax scan keeps its existing output; score analysis is opt-in. Typed analysis emits the dependency graph even without --score. Deno configuration/import-map semantics require native Deno verification; see [runtime guidance](runtime-deno.md).

`score.version` is 1. Dimensions remain separate; there is no total, repository ranking, or comparison across scopes. Each dimension has `grade`, `evidence` (relative file, line, detail), and a limitation note.

| Number of indications | Grade |
| --- | --- |
| 0 | 3 |
| 1–2 | 2 |
| 3–9 | 1 |
| 10 or more | 0 |
| Not evaluated, disabled, or incomplete | `null` |

A grade describes the selected evidence, not correctness, security, test coverage, or architecture quality. Narrowing the scope can remove evidence. Disabled rules never receive a clean grade; diagnostics make all dimensions unevaluated while preserving any available evidence. When tests were excluded or paths narrowed, the tests dimension has null grade and an empty evidence list; excluded test reachability does not justify listing source files as untested.

| Dimension | Evidence |
| --- | --- |
| `duplication` | `DUPLICATE_BODY`: repeated function bodies with at least `cloneMinTokens` tokens (default 60). Each body after the first representative contributes one indication. |
| `complexity` | `HIGH_COMPLEXITY`: per-function cyclomatic complexity greater than `complexityLimit` (default 15). |
| `coupling` | `DEPENDENCY_CYCLE` and `FORBIDDEN_DEPENDENCY`: representative concrete runtime import cycles and explicitly configured forbidden dependencies. |
| `useless-layers` | `DELEGATING_LAYER`: classes containing at least two forwarding methods, without explicit inheritance contracts or argument transformations. |
| `tests` | Selected source files without a runtime import/reexport path from selected test files. This does **not** measure code coverage, assertions, actual test execution, or behavioral relevance. Excluded tests and explicit `--path` scopes produce `null`. |

All findings are P2/P3 `HEURISTIC`, and preserve source/test scope. The tests dimension supplies evidence without emitting a defect finding.

## Duplicate bodies

Normalization removes trivia and renames unambiguous function parameters and local variable bindings. Tokens follow parser-established boundaries so regex literals, templates and JSX cannot be mistaken for comments. It preserves literals, property keys (including shorthand destructuring keys), named callees, free identifiers, types within bodies, and token order. Repeated binding names cause the body to be skipped rather than guessing lexical ownership. Nested functions retain their names and are also analyzed independently. This intentionally misses some equivalent bodies; matching bodies can still implement legitimate separate contracts. No file-length or interface/class similarity rule is used.

## Complexity and forwarding classes

Complexity starts at one and increments for `if`, loops, non-default `case`, `catch`, conditional expressions, and `&&`, `||`, `??`. Nested function decisions belong only to that function. This is a documented syntactic metric, not a general control-flow or runtime-cost model.

Forwarding detection accepts direct calls through `this.delegate.method` with unchanged positional parameter identifiers. Explicit `extends`/`implements`, transformed arguments, meaningful property initializers, non-forwarding methods, and constructors with work beyond direct dependency assignments prevent the signal. Legitimate adapters can still match; review their contracts and ownership.

## Dependency graph and boundaries

`graph.version` is 1. Edges contain `from`, `to`, `line`, and `typeOnly`; paths are root-relative. Static imports, import-equals declarations, and reexports are supported. Mixed named imports/reexports can contribute separate type and runtime edges. Explicit type-only edges do not participate in runtime cycles or runtime test reachability. Dynamic imports, arbitrary `require` calls, runtime module loading and bundler rewriting are outside this analysis.

Resolution reuses typed compiler symbols and compiler options, including tsconfig paths and local package imports. Fallback resolution reads only the source files already admitted into memory; it does not read or execute additional project files. Syntax mode can resolve selected relative modules, but lacks aliases and package configuration not supplied by a typed program. Unresolved imports are not invented as local edges. Typed compiler diagnostics remain visible in the overall report.

In typed mode, admitted local non-declaration context files can complete graph paths outside `--path`; only selected files produce findings. Dependencies under node_modules and declarations are not graphed. Cycle output contains one concrete closed path through a selected file per strongly connected component; it is not an exhaustive enumeration of every cycle or proof of an initialization failure.

Boundaries use explicit path or module-name prefixes with segment boundaries:

```json
{
  "version": 1,
  "score": true,
  "boundaries": [
    { "from": "src/domain", "disallow": ["hono", "src/http"] }
  ]
}
```

This rejects dependencies on `hono` (including its subpaths) and resolved `src/http` modules from `src/domain` files; it does not match `src/domainish`. Type-only dependencies also violate an explicitly configured boundary. A domain folder name alone never activates a Hono restriction. External packages have no graph edge, but their literal import/reexport specifier can match a configured boundary.

Repeated analysis of an unchanged selected source set is deterministic. Adjust thresholds and enabled rules through validated JSON configuration; grades from different rules, settings, excluded files, or modes are not comparable.


