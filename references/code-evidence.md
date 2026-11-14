# Executable evidence and counterexamples

## HTTP/database behavior

[Backend package](../examples/backend/README.md) uses Hono, Zod and real SQLite through `node:sqlite`. Its feature owns `types/`, `interfaces/`, `constants/` and `schemas/`. Run `npm ci --ignore-scripts` and `npm run check` in that directory with the documented Node version.

Its tests verify HTTP statuses and stored state for invalid input, absent/invalid identity, actor and tenant isolation, immutable fields, idempotent replay, conflicting payloads and rollback when an outbox trigger rejects a write. The authentication port accepts an already verified actor; test tokens are only fixtures. This does not implement Better Auth, a Drizzle adapter, remote database behavior, full production hardening or distributed delivery.

When adapting it: preserve the existing authentication and persistence integrations, put ownership predicates in the actual operation, keep external side effects outside the transaction, and write tests against the project's real driver. Do not copy its fresh-schema initialization as a production migration system.

## Pinned upstream source inspection

Validation on 2026-11-14 inspected these immutable snapshots:

| Project | Revision | Scope | Files including tests | Files excluding tests |
|---|---|---|---|---|
| Hono | `f6fbaf0299c48eea9e656e03e2ffe7ac755e8823` | `src` | 314 | 189 |
| Better Auth | `3fa26c979160914ce8e1c0e8786b1f48aa2552e5` | `packages/better-auth/src` | 392 | 281 |

Both scans completed without parse diagnostics with TypeScript 6.0.3. These are source inspections, not execution of upstream test suites or proof of production safety. Counts are scope measurements, not precision/recall estimates.

### What the findings mean in context

- [Better Auth origin-check fixture](https://github.com/better-auth/better-auth/blob/3fa26c979160914ce8e1c0e8786b1f48aa2552e5/packages/better-auth/src/api/middlewares/origin-check.test.ts#L943): security options are deliberately disabled to test distinct behaviors. All eight security-toggle signals in the selected Better Auth corpus are in tests. **Disposition: retain the tests**, not eight production vulnerabilities.
- [Better Auth origin-check fallback](https://github.com/better-auth/better-auth/blob/3fa26c979160914ce8e1c0e8786b1f48aa2552e5/packages/better-auth/src/api/middlewares/origin-check.ts#L26): an empty catch falls through to `return false` from `shouldSkipOriginCheck`. Failure to parse a path does not itself skip the check. **Disposition: retain pending broader context**, no auth bypass established by the empty catch.
- [Hono mount fallback](https://github.com/honojs/hono/blob/f6fbaf0299c48eea9e656e03e2ffe7ac755e8823/src/hono-base.ts#L377): optional execution-context access can throw outside the worker environment; the catch leaves it undefined for the mounted adapter. **Disposition: legitimate fallback retained**, rather than mechanically rethrowing.
- [Hono client type tests](https://github.com/honojs/hono/blob/f6fbaf0299c48eea9e656e03e2ffe7ac755e8823/src/client/client.test.ts#L1724): real directives after complex syntax were missed by the old standalone scanner. Parser-boundary traversal recovers them. **Disposition: review test intent**, not automatic deletion.
- [Better Auth secondary storage](https://github.com/better-auth/better-auth/blob/3fa26c979160914ce8e1c0e8786b1f48aa2552e5/packages/better-auth/src/db/internal-adapter.ts#L439): JSON can be the value of one ternary branch before an assertion. The corrected rule retains this review lead. **Disposition: investigate storage trust/validation**, without declaring corrupted or exploitable data from syntax alone.

Audit-specific raw reports, the pinned manifest, reproduction script, original scanner, test logs and source hashes are kept outside the installable skill at `docs/audits/2026-11-14-typescript/` in the development workspace. Run `node docs/audits/2026-11-14-typescript/reproduce-corpus.cjs --fetch` from that workspace after preparing the skill. Upstream source is neither bundled into the skill nor required for normal use.

Primary API references: [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [Hono request testing](https://hono.dev/docs/guides/testing), [Node SQLite](https://nodejs.org/api/sqlite.html). The installed versions and executable tests, not future documentation changes, define the recorded validation.
