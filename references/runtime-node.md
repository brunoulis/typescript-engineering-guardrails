# Node.js profile

- Inspect Node version and module mode, tsconfig module resolution, runtime TS stripping/build pipeline, target deployment and lockfile. Do not assume Node executes every TypeScript syntax or alias directly.
- Guard event loop against sync CPU work, sync I/O and enormous JSON payload transformations. Use Node worker threads for CPU-bound tasks only when measured; workers have startup, memory and transfer costs.
- Audit streams/backpressure, AbortSignal, HTTP timeouts, pooling, open handles, event listeners, cron timers, unhandled promise rejections, SIGTERM graceful shutdown and readiness.
- Production security: trusted proxy config, headers, CORS (not auth), secrets, environment, process privileges, supply-chain policies and dependency advisories.
- Typecheck, lint, unit/integration/test HTTP and deploy smoke tests; pin compatible Node LTS and lock versions. `node --test` and external runners are optional choices: follow repo.
