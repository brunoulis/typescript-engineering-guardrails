# Oracle checks: acceptance run (2026-11-17)

Target: a private Deno + Oracle backend, 173 TypeScript files, read-only snapshot taken with `git archive HEAD` (no `.env`, no certificates, no `node_modules`). The target working tree was clean before and after the run. No private file names, paths or content are recorded here.

Environment: Node v22.17.0, Windows 11 Pro (10.0.26300). Only Windows was exercised.

## Commands

```
git -C TARGET status --short                 # empty, before and after
git -C TARGET archive HEAD | tar -x -C SNAP
node scripts/ts-rails-audit.cjs --root SNAP --format json > SNAP-report.json
node scripts/ts-rails-audit.cjs doctor oracle --root SNAP
```

## Audit results

| Code | Count |
| --- | --- |
| EXPLICIT_ANY | 62 |
| NON_NULL_ASSERTION | 132 |
| UNVALIDATED_JSON_CAST | 10 |
| EMPTY_CATCH | 6 |
| POTENTIALLY_UNBOUNDED_CONCURRENCY | 2 |
| SQL_STRING_INTERPOLATION | 2 |
| SQL_DYNAMIC_IDENTIFIER | 1 |

The existing rule counts are unchanged from before the SQL rules. The 3 `SQL_*` findings are all in one file in the Oracle repository layer.

## Manual classification of the 3 SQL findings

All 3 are cleared leads, not injection paths. The flagged code is a private helper inside one repository factory. It has 3 call sites, all in the same file. Each passes a string literal for the SQL prefix and a string literal for the `ORDER BY` text; user input only travels through bind parameters. The other interpolations in the file are module-level constants. No other file is flagged by the SQL rules.

## Doctor

- Status `TOO_OLD`, exit code 2.
- Driver mode: thick (3 source lines: `initOracleClient` / `thin = false`).
- Client 12.2.0, found on `PATH` through an Oracle home path; required minimum 19.1.
- 2 foreign-platform (linux) `libocci` libraries listed in the project tree.
- This matches the machine's real test failure, `DPI-1050` (client 12.2 found, 19.1 or higher needed).

## Dropped idea: ORACLE_TEST_NOT_HERMETIC

It was implemented and measured, then removed. It flagged 10 test files that reach the driver through static imports. In the real run only 1 of them failed without a client (the one whose code initialises thick mode at load); the other 9 passed. Precision was about 10 %, because a static import path does not decide when the native client loads. The Oracle reference tells the reader to decide by running the test with the client absent.

## Limits

- Leads are not proof; each needs a human read of the callers.
- The rule does not follow imports or call sites, so a helper that only ever receives literals stays a lead.
- `doctor` reads file names and source text only. It cannot confirm the client version that actually loads, credentials, reachability or privileges.
- Only Windows was exercised.
