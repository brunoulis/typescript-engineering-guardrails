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

For patch-only clients, prepare a request with `node <skill-dir>/scripts/package-context.cjs --task FILE`; the caller applies the patch and runs project checks. Use the supplied snapshot directly. Otherwise get one from the package root with `node <skill-dir>/scripts/package-context.cjs --brief FILE` (omit `--brief FILE` for an inline request). It includes the brief, file names, source, tests and runner. Read another file only for a missing dependency or a partial inventory.

Patch source and focused tests together. Use small shared fixtures. When failure can drain in-flight work, attach the rejection assertion first. Reject one worker, settle every other pending worker, then await the assertion. Check the original reason, including falsy values. For iterator cleanup, fail a read and assert which acquired iterators close, in order, including the one that failed.

Run the supplied checks and any new tests they omit together, using the same build. Give the result in a sentence. For audits and migrations use the [engineering guide](engineering-guide.md).
