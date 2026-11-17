# Execution ledger — plan: 2026-11-16-typescript-v2.md

Design approved in full by user, including PostgreSQL/TimescaleDB. Base d1bf4e6. Baseline: 57 tool tests, 11 backend tests and typecheck passed.

Ruling: execute in the existing checkout on a new local codex/typescript-v2 branch — preserves the user's visible workspace and avoids an unrequested worktree/extra approval; no commits or publishing.
Ruling: user already explicitly approved full implementation, so proceed with this implementation plan without another approval round. Core and independent example directories have separate owners.

Tasks pending: 1–8. Record checks and decisions here as work proceeds.

Task 1: complete — TypeScript strict build, generated CLI, 57 preserved characterization tests pass. Task 2 in progress; RED typed CLI/config/alias cases captured. Independent examples and architecture subsystem delegated via dispatching-parallel-agents with separate owned paths. No source API claims beyond tested compiler6.0.3.
Ruling: declaration reads allow16MiB (lib.dom.d.ts exceeds2MiB in TS6.0.3); source limit remains2MiB; total128MiB and20000-file semantic budgets remain enforced.

Ruling superseded by user: no codex branch. Switched back to main with all uncommitted work preserved; deleted the empty local codex/typescript-v2 branch. Continue implementation on main as explicitly requested, without commits/push.

Tasks2–6 implemented and focused suites green: semantic aliases/bounds/errors/project references, graph+quality20tests, JSONconfig/baselines/SARIFschema, real Knip/dependency-cruiser+typescript-eslint, real session backend17tests, PG/Timescale and actual Bun/DenoHTTP+data. Task7CI/corpus/benchmark implemented; final benchmark refresh pending final suite. Task8docs updated; independent whole-change reviewer completed. No data claims inferred from mere workflow configuration.
Final: fixed dangling baseline symlink — RED created victim, GREEN rejects lstat symlinks and uses exclusive new-file creation/atomic replacement; live/ancestor links also exercised.
Final: fixed target noCheck option hiding diagnostics — RED COMPLETE/no errors, GREEN forces noCheck:false and records TS2322/2307.
Final: fixed late integration diagnostics retaining clean grades — RED non-null grades, GREEN finalizes all grades null after final diagnostics.
Final: fixed typed Node fetch JSON omission — actual copied Node24.19.2/Undici7.24.6 typings RED without DOM, GREEN class BodyMixin json declaration recognition; DOM and serializer negatives preserved.
Final: fixed baseline failures suppressing computed diagnostics — RED stdout empty, GREEN BASELINE_ERROR added and full JSON/SARIF original parse diagnostics rendered.
Final: fixed regex/template/JSX clone-token boundaries — parser-leaf tokens and exact token thresholds, architecture20/20.
Final: added real Bun/Deno native HonoHTTP validation/error/cancellation/shutdown fixture per missing acceptance item; task-local Bun1.3.10/Deno2.9.8 actually executed.
Final: fixed composite project compatibility — regression revealed forced incremental:false invalidated composite configs; preserve option and never emit/build instead. Solution and missing-reference cases pass without output files.
Final: external subprocess timeout has real process RED missing termination then GREEN50ms termination and invalid exit7 rejection. Full aggregate verification now running.

Task7: complete — final stable-source benchmark/current hashes verified;42 labelled corpus mode executions COMPLETE/immutable; pinned OS/runtime CI configured (remote jobs not executed).
Task8: complete — metadata2.0.0, docs/retrieval links verified, independent findings fixed with RED/GREEN; aggregate106tool+11SQLite+17backend+4dataNode+Deno2+BunHTTP/DB+permission checks all green, no skips. Clean source-only temp installation (no dist/node_modules copied) npm ci --ignore-scripts/check/test reproduced106/106. Four package dependency audits0vulnerabilities. Owned DB fixtures removed. All work uncommitted on main; no codex branch exists.
Cleanup limitation: automatic execution review rejected recursive removal of the newly-created clean-install temp with 'blocked by policy', including a direct literal-path retry after verifying no symlink. Directory preserved at C:/Users/luisv/AppData/Local/Temp/rails-v2-clean-0adb7ea516f1495eb12a92d5cec10001. No alternative deletion mechanism attempted.

Application-derived followup: real Deno backend read-only audit exposed _test/test.ts classification, redundant missing-program diagnostics and fabricated missing-test score evidence under excluded paths; all3RED/GREEN corrected. Public policy lifecycle regressions and TCP readiness correction verified on own disposable Timescale2.22.1/PG17.6 only. Target unchanged; private reports outside installable repo. Full suite109+11and data4+Bun+Deno2+backend17green; independent targeted review no important findings. Benchmark refresh in progress. No new branch/commit/push.

Application follow-up complete: current-source benchmark hash c23f84a3cb6e4319203bceae05b50155e88491b785a46c95bf551d3b643bc7a5, full109+11and data/runtime/backend matrix green. Target native Deno check1993files and scoped lint4files pass; full target suite unexecuted by scope. Private report outside installable repo, target source hash/Git unchanged, owned fixtures removed, local main no commits/publish.
