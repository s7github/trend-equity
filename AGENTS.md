# AGENTS.md

**The canonical agent guide for this repository is [CLAUDE.md](CLAUDE.md). Read it first — commands, architecture, agent rules, and the required project-tracking workflow all live there.**

This file is intentionally a pointer, not a copy: two guides drift apart (this one previously did). Do not add content here — edit CLAUDE.md instead.

Quick orientation for any agent or developer:

| Need                                          | Go to                              |
| --------------------------------------------- | ---------------------------------- |
| How to build, test, and work in this codebase | [CLAUDE.md](CLAUDE.md)             |
| What tasks exist / are in progress (`TE-NN`)  | [docs/BACKLOG.md](docs/BACKLOG.md) |
| Why things are the way they are               | [DECISIONS.md](DECISIONS.md)       |
| What shipped, when                            | [CHANGELOG.md](CHANGELOG.md)       |
| What the product is (tiers, features)         | [PRD.md](PRD.md)                   |
| Detailed implementation plans                 | `docs/superpowers/plans/`          |

**Non-negotiable:** before starting work, check the backlog and decisions log; when you ship, update the backlog and changelog in the same commit.

<!-- BEGIN ai-vault:repo-rules (managed block, source: ai-vault Rules/AGENTS.md) -->

# Rules for AI agents

## Package manager

- Use pnpm for all JavaScript/TypeScript work: `pnpm install`, `pnpm add`, `pnpm run <script>`, `pnpm dlx`. Never run npm, npx or yarn, and never create `package-lock.json` or `yarn.lock`.
- If a project is locked to npm (has `package-lock.json`, no `pnpm-lock.yaml`), say so and ask before migrating. Do not mix package managers silently.
- New projects: set `"packageManager": "pnpm@<version>"` in package.json and a `preinstall` guard that rejects non-pnpm installs.

## Secrets and private data

- Secrets live in Doppler, one Doppler project per repo. Run things with `doppler run -- <command>`. Secrets never go in files, commits, notes, memory, logs, prompts or chat.
- Do not read or print `.env*`, key or certificate files, or tokens. Do not run `doppler secrets download`, `doppler secrets get`, `printenv`, `env` or `set`. If a value is needed, ask the user to run the command or use `doppler run`.
- Never put a token on a command line (`curl -H "Authorization: Bearer ..."`). It lands in shell history and in tool permission allowlists. Reference an env variable and run under `doppler run`.
- If a secret is exposed anywhere, stop and tell the user immediately so they can rotate it. Deleting it is not enough.
- Treat `.env.example` as the only committed env file. It lists names with empty or fake values.

## Git hygiene

- Commit identity is the GitHub noreply address, never a personal email. Check `git config user.email` before the first commit in a repo.
- Commits, messages, code, docs and issues must not contain: personal email, phone, home address, bank or tax identifiers (IBAN, KVK, BTW), customer or client data, secrets, or absolute paths that include the user's name.
- Stage files by name. Review `git diff --cached` before committing. Never `git add -f` around an ignore rule, never `--no-verify`.
- Commit or push only when the user asks.

## Remote and web sessions

- Cloud and remote agents cannot see this machine. They only get rules that are committed in the repo as `AGENTS.md` (with `CLAUDE.md` containing `@AGENTS.md`). Keep those files in every repo and never rely on the local vault there.

<!-- END ai-vault:repo-rules -->
