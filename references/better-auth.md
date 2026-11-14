# Better Auth integration audit

- Inventory installed Better Auth version/plugins, database adapter, session strategy, user/entity mapping, providers, trusted origins, callback URLs and backend routes before prescribing APIs.
- Authentication ≠ authorization: enforce resource ownership, tenant scope and roles inside actual business operations even after obtaining a session. Test with two tenants and a forged resource ID.
- Audit `trustedOrigins`, `baseURL`, reverse proxy/forwarded header trust, secure/httpOnly/SameSite cookies, CORS/credentials coupling, cross-domain cookie settings, CSRF and origin checks.
- Treat `advanced.disableCSRFCheck` or `advanced.disableOriginCheck` as urgent review; don't silently disable to fix cross-origin flows. Review provider OAuth state/PKCE, account linking, callback URLs and open redirects.
- Session expiration, revocation, caching, account changes and logout semantics are version/config specific. Verify that stale sessions cannot retain invalid privileges where application policy demands revocation.
- Built-in Better Auth rate limiting does not replace rate/resource policies for application routes. Check distributed storage and trusted proxy IP configuration.
- Protect private session data and tokens from logs; verify schema migrations and plugin-specific fields.
- Source: https://better-auth.com/docs/reference/security
