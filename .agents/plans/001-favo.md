# 001: favo

favo (Portuguese and Italian for honeycomb) keeps several AI subscriptions on one computer, and on every computer you own, without logging in and out. Each account is a sealed cell with its own login and threads. The walls between cells are shared: CLAUDE.md, skills, settings.

It is a smaller, TypeScript take on [Ditto CLI](https://github.com/reyanshgupta/ditto-cli), from which it takes a lot, with a pretty TUI and first-class remote machines.

## Goals

1. `favo` opens one view with every machine, every account and every provider login.
2. `favo claude work` runs a provider as an account. No environment variables, no re-login.
3. `~/.favo/accounts/<account>/<provider>` is a stable path that can be pasted into T3 Code.
4. Another machine behaves like this one: same view, same actions, over SSH and Tailscale.
5. Actions never depend on the UI, so a web or desktop front end can reuse them later.

## Decisions

- Providers are Claude Code, Codex, Antigravity CLI and OpenCode. Nothing else.
- `personal` is not a folder under `~/.favo`. It is the labs' own `~/.claude`, `~/.codex`, and so on, and it is the base every other account links back to.
- An account spans providers. `work` can hold Claude and Codex; the provider folder appears on first use.
- An item is either shared or private. Shared is a named allowlist per provider; everything else is private, so a new credential file can never leak between accounts. Settings are shared.
- Links are reconciled at launch and on demand, never on a schedule. A symlink cannot go stale; only a missing or broken link can drift, and that only matters when a tool starts. A real file where a link belongs is reported, never overwritten.
- favo never reads a token's value. Logins run the official commands with the right folder set, and identity comes from the official status commands.
- favo may add its own hook to a provider's base config, only when asked, by `favo hooks install` or a yes in the TUI. A hook handles thread IDs and folders and nothing else, and it does nothing outside a provider favo started. It keeps the user's own hooks, and `favo hooks uninstall` removes it. favo never answers a provider's own approval, such as Codex's trust prompt, for the user.
- One binary. `favo serve --stdio` is the backend for another machine; the local backend reaches it through `ssh`, so there are no ports, tunnels or daemons, and Tailscale SSH handles identity.

## How each provider is separated

Each row was tested on the real CLI before this plan was written.

| Provider    | Moved by                                          | Status comes from                                                       | Login                                      |
| ----------- | ------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------ |
| Claude Code | `CLAUDE_CONFIG_DIR`                               | `claude auth status` (JSON)                                             | `claude auth login`                        |
| Codex       | `CODEX_HOME`                                      | `codex app-server` `account/read`, falling back to `codex login status` | `codex login`                              |
| Antigravity | `HOME`, a private home that mirrors the real one  | `agy models`                                                            | launching `agy`; there is no login command |
| OpenCode    | `XDG_DATA_HOME`, `XDG_STATE_HOME`, `--standalone` | `opencode auth list`                                                    | `opencode auth login`                      |

OpenCode leaves `XDG_CONFIG_HOME` alone because other tools read it (`gh` shows logged out when it moves), which also shares the config for free. `--standalone` avoids the fixed port of the background service.

## Architecture

```text
packages/domain     pure rules: providers, accounts, link reconciliation, machines
packages/contracts  the language between front ends and the backend: RPC methods in zod
apps/server         the backend: layered modules with a gateway for every external thing
apps/client         the TUI: MVVM with a Zustand application layer and OpenTUI React views
apps/cli            the binary: argument parsing, composition, and printing
```

Backend modules are layered: `controllers/`, `services/`, `repositories/`, `gateways/`, `utils/`, with levels `system` (1), `providers` (2), `accounts` (3), `machines` (4), `terminal` (5). A gateway is an abstract class with its real implementation and its test double beside it.

The client is explicit MVVM: a View calls a Zustand Service (the ViewModel), which calls a Repository or Gateway port, adapted by an `Api*` or `Test*` class. Entities are classes. `Test*` adapters share `mockDb`, so the whole application runs with no backend at all.

Remote machines are one rule in the backend router: a request with a `machineId` is forwarded to that machine's backend. The client asks one backend for everything, which is what a browser will need too. Login and launch cannot be data, so the backend returns a terminal plan (command, arguments, environment), and each front end runs it. A remote plan is `ssh -t <target> favo claude work`.

## Phases

1. Domain, contracts, and the backend with gateways and test doubles.
2. CLI on top of the backend.
3. Client application layer, tested against `mockDb`.
4. TUI views, tested with OpenTUI's test renderer.
5. Remote machines: `serve --stdio`, forwarding, self-install, discovery from `~/.ssh/config` and Tailscale.
6. Real checks on macOS and on `devbox`.
7. Skills, README, and the credit to Ditto.

## Testing

- `packages/domain`: pure rules.
- `packages/contracts`: a valid and an invalid example per method.
- `apps/server`: integration tests through the router with test doubles, a loopback of two backends for remote machines, and real-filesystem tests that drive fake `claude`, `codex`, `agy`, `opencode` and `ssh` binaries.
- `apps/client`: service tests and screen tests against `mockDb`, with no backend.
- An architecture test fails on a layer violation, a `../` import, or an impure domain.

`bun run verify` is lint, typecheck, test and build.

## Not in v1

Thread copying, per-folder accounts, T3 Code syncing and a web front end. The contracts keep all of them possible.
