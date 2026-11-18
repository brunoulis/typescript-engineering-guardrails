---
name: typescript-engineering-guardrails
license: MIT
description: Use when implementing, auditing, reviewing, refactoring or migrating TypeScript backends on Node.js, Bun or Deno, including Hono, Better Auth, Drizzle, PostgreSQL and identified TimescaleDB usage.
metadata:
  version: "2.0.0"
  family: "engineering-guardrails"
  tags:
    - typescript
    - node
    - bun
    - deno
    - hono
    - better-auth
    - drizzle
    - backend
    - security
    - architecture
    - anti-slop
---

# TypeScript engineering guardrails

For a package edit, get the source, tests, package inventory and test command with `node <skill-dir>/scripts/package-context.cjs` from the package root. Pass `--brief FILE` for a file-backed request, or append selected paths for a larger package.

Use the snapshot for one patch. Cover untested behavior with shared fixtures. Check exact failure values, including falsy ones. Observe rejection and settle controlled peers before awaiting the aggregate unless early rejection is guaranteed. In one shell call run the project checks, then the added tests against that build, preserving exit statuses. Report the result.

Use [the engineering guide](engineering-guide.md) for audits, framework boundaries and migrations.
