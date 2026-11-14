# Sources and interpretation (reviewed 2026-11-14)

## Reddit: experience reports, not standards
- r/typescript — large-scale backends and type proliferation: https://www.reddit.com/r/typescript/comments/1c40avk/
- r/typescript — group by component/feature and control cross-feature imports: https://www.reddit.com/r/typescript/comments/z9dc9m/
- r/typescript — structure and SQL-heavy backend refactor: https://www.reddit.com/r/typescript/comments/1gcbpyd/
- r/typescript — prematurely splitting types/files: https://www.reddit.com/r/typescript/comments/n5f63t/
- r/typescript — migrating vibe-coded monorepo and overengineering traps: https://www.reddit.com/r/typescript/comments/1uo498j/
- r/node — coupling in growing projects: https://www.reddit.com/r/node/comments/1szv5ae/
- r/node — singleton services vs prescriptive DI frameworks: https://www.reddit.com/r/node/comments/1spq90h/
- r/node — small CRUD handlers vs boilerplate controllers/services: https://www.reddit.com/r/node/comments/1guqsak/
- r/typescript — TypeScript not runtime validation: https://www.reddit.com/r/typescript/comments/1tujgd6/
- r/node — production Bun migration skepticism/experience: https://www.reddit.com/r/node/comments/1jrla06/
- r/node — test compatibility/runtime experiences: https://www.reddit.com/r/node/comments/1rm612y/

Takeaway: No universal layout wins. Prefer feature cohesion and explicit domain boundaries when the actual code benefits; avoid redundant interfaces/DTOs and excessive technical layers; verify data trust boundaries. Reddit claims must not be treated as measured platform facts.

## Primary documentation
- TS config: https://www.typescriptlang.org/tsconfig/
- Hono validation: https://hono.dev/docs/guides/validation
- Better Auth security: https://better-auth.com/docs/reference/security
- Drizzle transactions: https://orm.drizzle.team/docs/transactions
- Bun Node compatibility: https://bun.sh/docs/runtime/nodejs-compat
- Deno config: https://docs.deno.com/runtime/fundamentals/configuration/
- Deno npm/node compatibility: https://docs.deno.com/runtime/fundamentals/node/
- OWASP API Top 10: https://api-security.owasp.org/editions/2023/en/0x11-t10/

Reverify official docs and installed versions before implementing because APIs/security defaults evolve.
