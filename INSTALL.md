# Install TypeScript backends Engineering Guardrails

Install only the language skill needed by the project. This repository distributes a portable skill folder with supporting resources; native plugin manifests, lifecycle hooks and persistent mode switches are not supplied.

## Choose scope and agent

The repository root containing `SKILL.md` is the skill folder. Keep its references, templates, examples and tool sources together. Use a clean checkout/release or a curated copy; do not ship `.git`, build outputs, caches, `node_modules`, credentials or external audit corpora. If the destination already contains a skill with this name, inspect and preserve local changes before replacing it.

| Agent | Project directory | Personal directory |
|---|---|---|
| Codex | `.agents/skills/typescript-engineering-guardrails/` | `~/.agents/skills/typescript-engineering-guardrails/` |
| Claude Code | `.claude/skills/typescript-engineering-guardrails/` | `~/.claude/skills/typescript-engineering-guardrails/` |
| Hermes Agent | `.hermes/skills/typescript-engineering-guardrails/` | `~/.hermes/skills/typescript-engineering-guardrails/` |

Project paths are relative to the **consuming project**, not this source repository. In a mixed-language repo, select the affected package/task and install the relevant skills; installation does not make every installed skill relevant on every turn.

## Option A: portable folder installation

Copy the clean folder to one destination above, with `SKILL.md` directly inside `typescript-engineering-guardrails/`. Do not copy only SKILL.md or nest the repository folder twice. This route needs no Node/npm and does not run the bundled tools. With a verified Git repository URL, cloning directly into a new destination is another option; select a reviewed release or commit for reproducibility.

## Option B: skills CLI

The [skills CLI 1.8.1](https://github.com/vercel-labs/skills/tree/v1.8.1) requires Node >=22.20.0. This optional installer dependency is separate from the language's own toolchain. From the consuming project, replace the quoted path with a clean checkout of this skill:

```sh
npx --yes skills@1.8.1 add "<absolute-path-to-clean-skill-folder>" --list
npx --yes skills@1.8.1 add "<absolute-path-to-clean-skill-folder>" --skill typescript-engineering-guardrails --agent codex --copy
npx --yes skills@1.8.1 list --agent codex
```

Choose `--agent claude-code` or `--agent hermes-agent` for those hosts. Add `--global` only for an intentional personal installation. `--copy` avoids relying on symlink privileges. The first `--yes` belongs to npx; the installer still presents its own confirmation. Do not use `--all` to install unrelated skills/agents.

A published, verified GitHub source can replace the local path, using `owner/repository@<reviewed-tag-or-full-commit>`. Confirm that revision contains this skill and its resources; local improvements are not available remotely until published. Local-source copies are not assumed to auto-update from GitHub.

## Confirm discovery and language scope

Refresh the host's skill list or start a new session if needed. Verify the installed file, exact skill name and relevant references. Then request:

> Use `typescript-engineering-guardrails`. Review this TypeScript backend in audit mode. Verify actual runtime/library versions, input validation, authorization and async bounds. Preserve our types/interfaces/constants convention and report syntax leads separately from confirmed bugs.

Scope: TypeScript backends on Node, Bun or Deno, with the target runtime and library versions verified. Preserve feature-local types/, interfaces/ and constants/, with runtime validators in schemas/. This is not a universal frontend/UI skill.

A successful file copy or CLI listing proves placement, not that a running host loaded or followed the instructions. Check the host's skill picker/explicit invocation and inspect its response. Resolve duplicate copies with the same name if the wrong revision loads; do not assume hosts merge them.

## Optional tool preparation

The instructions need no Node runtime. The optional scanner requires Node 22+ and the tool's own locked TypeScript dependency. Run inside the installed skill folder, not the audited backend:

```sh
npm ci --ignore-scripts
npm test
npm run check
```

The executable backend example/full verification uses Node 24.22.1 and its own install; see CONTRIBUTING.md. Installing this skill does not change a Bun/Deno application's runtime or dependencies.

Use the project's own versions for its checks. Installing the skill does not authorize dependency upgrades, builds of an arbitrary target, source cleanup or adding CI to that target. Full contributor checks are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Optional project routing and maintenance

If persistent project guidance is wanted, merge the language-scoped paragraph from [the routing template](templates/always-on-agent-rule.md) into the existing AGENTS.md/CLAUDE.md or supported host configuration. Preserve existing instructions. Keep detailed guidance in the skill; do not paste its entire contents into every prompt or enforce it on unrelated languages.

For an update, review the source/revision diff and any tool requirements, preserve local customization, replace/update only this skill and repeat discovery and relevant tool checks. Do not bulk-update language dependencies. For removal, remove only this skill's verified installation/copy/link and its own optional routing paragraph; keep other skills and project instructions.

## Basis and verification limits

The distribution pattern is informed by [Ponytail installation](https://github.com/DietrichGebert/ponytail/blob/main/INSTALL.md) and [agent portability](https://github.com/DietrichGebert/ponytail/blob/main/docs/agent-portability.md): shared skill content with host-specific installation. Ponytail's plugin commands require its adapters; they are not commands for this repository.

Paths checked against official [Codex](https://learn.chatgpt.com/docs/build-skills), [Claude Code](https://code.claude.com/docs/en/skills) and [Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills/) documentation on 2026-11-14. CLI flags and agent IDs checked against [skills 1.8.1](https://github.com/vercel-labs/skills/blob/v1.8.1/docs/commands.md). Host discovery and OS support must be reported separately from an installer smoke test.
