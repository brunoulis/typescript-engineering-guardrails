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

Use the package's runtime, lockfile and callers. Preserve validation, ordering, error timing and ownership of pending work. In async failure tests, attach the rejection check and settle outstanding test promises before awaiting the aggregate unless the contract guarantees early rejection. Run type and behavior checks. Expand failures.

Use the relevant section for [external data contracts](references/types-and-contracts.md), [bounded asynchronous work](references/async-performance.md) or [authorization](references/security.md). Trace authorization and persistence through the request boundary. For audits, migrations, deployment, databases or runtime interoperability, select the workflow in the [engineering guide](engineering-guide.md). Audit read-only unless edits are requested. Report the behavior, checks and material limits.
