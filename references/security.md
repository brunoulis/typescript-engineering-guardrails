# API security and production concerns

## Mandatory threat review (as applicable)
1. Identify entrypoints: HTTP, webhooks, queues, CLI, scheduled jobs and admin routes; trust boundaries and sensitive data.
2. Check identity/authn separately from per-action authz, object-level and property-level authorization (BOLA/BOPLA), tenant filtering, least privilege, mass assignment and service-to-service credentials.
3. Validate external inputs; bound size, complexity, pagination, uploads, concurrency and costly search/report endpoints; rate limit sensitive flows.
4. Review CSRF with cookie auth, trusted origins, redirects, CORS semantics, SSRF via user-provided URLs, injection, logging of PII/secrets and secure cookie settings.
5. Verify webhook signatures on raw body with provider-specific spec, timestamp tolerance and replay/idempotency policy. Do not blindly assume a universal signature format.
6. Review secrets management, lockfiles, package advisories, npm lifecycle scripts, CI permissions, container configuration and runtime capabilities.
7. Prove with adversarial tests: user A accesses user B's resource, cross-tenant list/query/update, admin route as normal user, modified immutable fields, expired session, replay webhook and invalid payload.

Logging review includes per-event/request volume, sink/backpressure and redaction before emission; avoid leaking credentials, raw native stderr or payloads in public errors. Retain useful bounded diagnostics with a documented activation/volume policy rather than imposing a universal quota.

For native dependencies, audit [permissions and provenance](native-interoperability.md): exact executable/library and source/hash, dynamic dependencies, build/download/lifecycle scripts, package preparation, inherited environment/cwd/credentials and target deployment capabilities. Deno `--allow-run` permits process creation; it does not constrain the child's OS access. `--allow-ffi` admits FFI/Node-API native code into the host process; it does not sandbox its syscalls. A process boundary offers crash isolation, while an OS/container policy must establish any claimed security sandbox. Do not widen to `-A` or execute preparation scripts implicitly to make checks pass.

Sources: https://owasp.org/API-Security/ ; https://api-security.owasp.org/editions/2023/en/0x11-t10/
