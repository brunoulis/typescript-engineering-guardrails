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

For small interactive edits, read the request, relevant sources, nearby tests and runner in one shell call. From a package root with ripgrep, substitute the actual brief, file patterns and installed skill path in this command.

```sh
rg --heading --no-line-number --max-filesize 32K "^" -g "*.{ts,tsx,mts,cts}" -g "*.{test,spec}.*" -g "AGENTS.md" -g "package.json" -g "tsconfig*.json" -g "run-tests.*" -g "TASK.md" . "<skill-dir>/SKILL.md"
```

Use explicit file paths for a larger package. If ripgrep is unavailable, `node <skill-dir>/scripts/package-context.cjs --brief FILE` returns a bounded snapshot. Inspect missing dependencies as needed.

Patch source and focused tests together. Use small shared fixtures. If failure may drain in-flight work, attach the rejection assertion before triggering failure. Settle all controlled peers independently of the aggregate, even for late rejections. A peer scheduled from the aggregate’s catch or finally can deadlock the test. Await the assertion after settling the peers. Check the original reason, including falsy values. For iterator cleanup, fail a read and assert which acquired iterators close, in order, including the one that failed.

Verify the edit in one shell call. Run the supplied checks, then any new tests the runner omits against that build. Propagate failures. If a diff check is useful, include it in this call after confirming the package is in a Git worktree. Report the results. Patch-only clients can use `scripts/package-context.cjs --task FILE`. For audits and migrations use the [engineering guide](engineering-guide.md).
