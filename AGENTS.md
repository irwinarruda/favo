# favo

favo (honeycomb, in Portuguese and Italian) keeps several AI subscriptions on one computer, and on every computer you own, without logging in and out. One Bun monorepo: `packages/domain` and `packages/contracts` are pure, `apps/server` is the backend, `apps/client` is the OpenTUI TUI, `apps/cli` is the one binary that composes them, and `apps/npm` is the `favo-cli` package, a dependency-free launcher that fetches that binary. The plan is `.agents/plans/001-favo.md`.

## Commands

Use Bun `1.3.14` (`.bun-version`).

- `bun install --os='*' --cpu='*'` installs everything, including the OpenTUI binaries for every target, which `build:all` needs.
- `bun run dev` runs favo from source. Use `FAVO_HOME=/tmp/favo` to keep away from your real `~/.favo`.
- `bun run dev:mock` runs the TUI on `mockDb`, with no backend at all.
- `bun run lint` runs `biome ci .`; `bun run lint:fix` applies fixes.
- `bun run typecheck` runs `tsc` over every project.
- `bun test` runs everything. No test needs a network, a login or a real provider.
- `bun run build` builds the binary for this machine; `bun run build:all` builds every target.
- `bun run install:local` copies the binaries to `~/.favo` and links `~/.local/bin/favo`. `favo machine add` from source needs this first, because it uploads from `~/.favo/assets/<version>/`.
- `bun run package:release` writes `dist/release`: the gzipped binaries, `SHA256SUMS` and `THIRD-PARTY-NOTICES.md`.

`bun run typecheck` and the architecture test do not cover `scripts/` or `apps/npm/bin/favo.mjs`, so check those by hand.

## Releasing

Set the new version in both `packages/contracts/src/version.ts` and `apps/npm/package.json`, turn `## [Unreleased]` in `CHANGELOG.md` into `## [X.Y.Z] - YYYY-MM-DD` under a new empty `## [Unreleased]`, update the compare links at its bottom, commit it to `main`, then push a `vX.Y.Z` tag. `check:release-version` fails the release when the changelog has no section for the tag. `.github/workflows/release.yml` tests on all three systems, builds, creates the GitHub Release, starts the binary on every platform, then publishes `favo-cli` to npm through trusted publishing and updates the formula in `irwinarruda/homebrew-tap`. Nothing is published by hand, and no npm token lives in CI. The tap is pushed with a deploy key limited to that repository, kept in the `homebrew` environment, which only release tags can reach.

`gh workflow run homebrew-check.yml -f tag=vX.Y.Z` installs from the public tap on every platform, and each release does this by itself.

Releases are immutable, so a bad binary burns its version number; fix it in a new version. To re-run a failed release, use `gh workflow run release.yml --ref vX.Y.Z -f tag=vX.Y.Z`.

## Working agreements

- `packages/domain` is pure: no I/O, no framework, no implicit clock.
- Every external thing on the backend goes through a gateway with a test double beside it.
- Views call services, services call ports. `apps/client/**/app/` knows nothing about OpenTUI, so a web front end can reuse it.
- Shared is an allowlist. favo never reads a token.
- No comments in production code. No `../`. No barrels. No TS `enum`. `undefined`, never `null`.
- Commits follow Conventional Commits.
- ALWAYS update `CHANGELOG.md` in the same commit as any change someone using favo would notice: a feature, a fix, a changed command, output or install step. Add one plain-language line under `## [Unreleased]`, in `Added`, `Changed`, `Fixed` or `Removed`, written for users, not about the code. Refactors, tests, CI and internal docs need no entry.

## Completion gate

`bun run verify` is lint, typecheck, test and build. Do not say something works until it passed. Running against a real provider or a real machine is a separate check and is reported separately.

## Skills

Load the skills that govern the paths a task touches:

| Path                           | Skills                                                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any TypeScript                 | `coding-styleguide`                                                                                                                                        |
| `packages/domain`              | `domain-styleguide`                                                                                                                                        |
| `packages/contracts`           | `contracts-styleguide`                                                                                                                                     |
| `apps/server`                  | `server-architecture` always, plus `server-service-styleguide` for use cases, gateways and tests, and `server-providers` for anything about a provider CLI |
| `apps/client`                  | `client-architecture` always, plus `client-service-styleguide` for services and ports, `client-jsx-styleguide` for views, and `client-tests` for tests     |
| A new file in `.agents/plans/` | `numbered-specs`                                                                                                                                           |

Skills that govern one workspace carry its prefix (`server-`, `client-`, `domain-`, `contracts-`). Skills that span workspaces have no prefix. A `-styleguide` skill says how one layer's code is written; an `-architecture` skill says where things live and which way dependencies point.
