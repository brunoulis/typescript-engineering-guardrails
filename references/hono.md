# Hono profile

- Hono is an HTTP framework, NOT a whole application architecture. Keep router/middleware responsible for transport mechanics; use feature boundaries for domain logic as complexity warrants.
- Validate query, params, body and headers at ingress with `validator`/`zValidator` or existing standard-schema middleware; use `c.req.valid(...)` after verification. Type inference/RPC types alone are insufficient against hostile network input.
- Check middleware order: auth/session retrieval, access control, CORS, rate limiting, body size and error handling are independent responsibilities. Do not trust a middleware merely because it is globally registered; check route mounting and bypasses.
- `c.env` and environment bindings depend on adapter/runtime. Never assume Deno/Bun/Node/Cloudflare integrations have identical startup bindings.
- Define typed `Variables`/bindings only where safe; don't couple service core to Hono `Context` needlessly. Map domain errors centrally to stable HTTP shapes without leaking sensitive info.
- Cover real request paths with `app.request` or integration harness, including negative auth/validation cases.
- Source: https://hono.dev/docs/guides/validation
