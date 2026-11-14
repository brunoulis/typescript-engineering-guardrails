# Bun profile

- Bun has significant Node compatibility, but it is NOT an identical V8 runtime. Audit native addons, Node API partial support, `async_hooks`, test runner differences, TLS, worker behavior, instrumentation/OTel and bundle/build assumptions against installed Bun version.
- Do not promise improved throughput/RSS from synthetic benchmarks. Measure this app's workload, connection patterns, p95/p99, memory and errors, compare equivalent environments.
- Verify real `bun test` behavior if used; Vitest/Jest may be chosen when existing test behavior or isolation demands it. Test mocks, coverage and parallelism are runner- and version-sensitive.
- Preserve committed lockfile and CI frozen installs. Avoid runtime migration in a general refactor; use a compatibility test matrix with critical integrations.
- External service clients, auth adapters, database drivers and production telemetry should be smoke tested on Bun in CI or staging when relevant.
- Source: https://bun.sh/docs/runtime/nodejs-compat
