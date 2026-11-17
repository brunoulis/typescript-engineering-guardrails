# Deno integrations: acceptance run (2026-11-17)

Environment: Windows 11, Node 22.17, Deno 2.9.8. Target: a private Deno 2 + Hono backend (173 TypeScript files), audited from a `git archive HEAD` snapshot plus `deno.lock`, without `.env`; the target tree stayed clean (`git status` empty before and after). Counts and categories only; no private source is recorded.

Command: `node scripts/ts-rails-audit.cjs --root SNAPSHOT --integration deno-check --integration deno-lint --integration deno-graph --integration deno-audit --format json` (22 s). All four integrations reported `COMPLETE`; the top-level status was `INCOMPLETE` only because one test file in the target does not parse.

| Integration | Report | Native evidence |
| --- | --- | --- |
| `deno-check` | `DENO_TYPE_ERROR` 8 (3 in `src/`, 4 in tests, 1 in `scripts/`) | `deno check` over all files: 8 errors; `deno check src/main.ts` alone passes |
| `deno-audit` | `DENO_AUDIT_ADVISORY` 30 (8 high). `node-forge` and `hono` reachable; `nodemailer` and `fast-xml-parser` not in the entrypoint graph | `deno audit`: 30 vulnerabilities, 8 high |
| `deno-lint` | `DENO_LINT` 50 (any / non-null rules excluded) | `deno lint --json` |
| `deno-graph` | `DENO_UNREACHABLE_FILE` 11 | each flagged file has no static importer (grep over `src`, `test`, `scripts`) |
| syntax rules, unchanged | `EXPLICIT_ANY` 62, `NON_NULL_ASSERTION` 132 | `deno lint`: 62 and 116 in `src/` (16 more in tests/scripts) |

Tests: 14 new tests (5 parser, 9 integration) pass; `ts-rails-cli` (11) and `integrations` (3) regression files pass, as do the reporting tests for config validation, SARIF and baseline. The reporting symlink tests and the full `npm run verify` were not run in this session (the heavy suite hung the workstation).

Limits: parsers are pinned to Deno 2.9.8 output; `deno-graph` cannot see dynamic imports with computed specifiers; `deno-audit` needs network access and a lockfile; only Windows was exercised.
