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

Identify the affected runtime, package, resolved dependencies and callers. For a local implementation, preserve the public type and runtime contracts, including validation, ordering and when errors become observable. Check who owns outstanding asynchronous work. Use the package's type check and behavioral tests for the change.

- For external input or serialization, consult [types and contracts](references/types-and-contracts.md). For concurrency or bounded resources, consult [async and performance](references/async-performance.md).
- For authorization or persistence, trace the actual request through the affected boundary and consult [security](references/security.md) or the relevant database guide.
- For audit, refactor, migration, dependency changes, runtime interoperability, or deployment and database work, select the appropriate workflow and references in the [engineering guide](engineering-guide.md). Audit the source read-only unless edits are requested.

For an implementation, report the behavior delivered, commands actually run and any limitation that matters to its use. For an audit, lead with the finding and consequence. Respect the requested response format.
