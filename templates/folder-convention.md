# Module organization convention (copy to AGENTS.md / project rules)

- Prefer feature-first code organization. Place each feature's `type` aliases/unions/brands in `types/`, real object contracts/ports in `interfaces/`, and runtime values in `constants/`. Use `schemas/` for runtime validation.
- Prefer feature-local paths (`modules/<feature>/types`, etc.); use `shared/types`, `shared/interfaces`, `shared/constants` only for truly reused stable semantics.
- Do not create placeholder files/empty directories or interfaces for every service. Reuse inferred types from authoritative validation/ORM schemas when appropriate.
- Keep behavior/test contracts unchanged during moves; verify imports and actual runtime, preserve backward-compatible import paths when required.
