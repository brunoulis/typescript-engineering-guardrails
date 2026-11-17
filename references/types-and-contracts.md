# TypeScript correctness and runtime trust boundaries

- Prefer placing type aliases/unions/brands in feature-local `types/` and object contracts/ports in `interfaces/`; runtime literals in `constants/`; schemas in `schemas/` (see `code-organization.md`). Avoid duplicated types when a validator or ORM schema is the real source of truth.
- Prefer project `strict` type checking, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` considered after compatibility assessment. Prevent regression on new files when legacy code cannot migrate all at once.
- Avoid unsafe `any`; use `unknown` at trust boundaries then parse/narrow. `as` and non-null assertions need a written invariant or validation. `satisfies`, discriminated unions, exhaustiveness checks and domain-oriented types can improve guarantees when proportionate.
- Distinguish opaque identifier types where accidental ID interchange creates genuine risk. Beware brand erasure when serializing; parsing still needed.
- Validate request query/path/body, external HTTP JSON, webhook payloads, queue messages, persisted blobs and env config at ingress. Do not repeatedly revalidate internal typed objects without threat evidence.
- Select schema library based on ecosystem (`zod`, `valibot`, standard schema) and existing conventions. Infer parsed types from schemas where safe; distinguish input/transformation/output. Never claim `c.req.json<T>()` or JSON casts perform runtime validation.
- Represent domain failures intentionally and map to stable HTTP error shapes. Handle nullability, integer precision, time zones, timestamps, money and pagination boundaries.
- Public contract changes require compatibility plan: versions, field defaults, consumers, OpenAPI/RPC inference and tests. Type-level API inference is not a runtime policy mechanism.

## Message behavior and deployed consumers

An unchanged exported signature does not preserve payload semantics, encoding, units/defaults, error mapping or generated-client behavior. Record producer → channel/storage → actual consumer and before/after behavior, including DB/outbox effects. Locate consumer call sites/generated output and exercise the real boundary; successful typecheck and runtime validation are separate evidence. Reuse the existing schema/source of truth rather than adding shadow DTOs or duplicate validators.

When independently deployed producers/consumers require compatibility, identify message/schema version and migration/read-old-write-new policy as needed. Test missing/unknown fields (reject, ignore or preserve intentionally), malformed/unsupported versions and errors. Cover ordering, duplicates/idempotency, partial delivery and disconnect/reconnect only where the channel's contract requires them. Do not add a versioned envelope to every internal object or impose reconnect semantics on a one-shot operation. An unavailable external consumer stays UNVERIFIED; a local mock cannot silently stand in for it. Feature-disabled and conditional-import behavior also needs scoped evidence or an authorized intentional change.

Native/generated boundaries additionally need numeric/encoding, ABI and ownership rules; see [native interoperability](native-interoperability.md). Generated typings are not runtime validation or a lifetime proof.
