---

name: server-providers
description: Use when adding or changing a provider, changing what a provider shares, or when a provider CLI changes behavior: login, status, config folder. Also use when the request says "codex changed", "share this file too" or "add a provider".
---

# Providers

favo supports Claude Code, Codex, Antigravity CLI and OpenCode. Adding one is a table entry in `packages/domain/src/providers/provider.ts` plus a shim in `apps/server/src/modules/providers/gateways/`.

## What was learned from the real CLIs

Test a provider on the real binary before changing its entry. Documentation has been wrong here more than once.

| Provider    | Facts                                                                                                                                                                                                                                                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `CLAUDE_CONFIG_DIR` separates the login. On macOS the keychain entry is tied to the folder path, so moving a folder signs it out. Saving through a linked `settings.json` keeps the link.                                                                                                                                                                             |
| Codex       | `CODEX_HOME` separates the login. `codex login status` can say logged in while the token is revoked; `app-server` `account/read` tells the truth, so favo asks that first. Over ssh, login needs `--device-auth` because the localhost callback cannot reach your browser. Plugins cannot be linked: its loader refuses code reached through a link outside its home. |
| Antigravity | `agy` follows only `HOME`, not `GEMINI_HOME`. There is no login or logout command: launching signs in, and `agy models` is the only status signal. Whether the login itself is per account is unverified, so `loginScope` is `unverified` and the UI says so.                                                                                                         |
| OpenCode    | Move `XDG_DATA_HOME` and `XDG_STATE_HOME`, never `XDG_CONFIG_HOME`, which other tools read (`gh` shows logged out when it moves). `--standalone` is required because the background service has a fixed port. One account holds several logins.                                                                                                                       |

## Windows

Tested on Windows 11 with real binaries.

- Symlinks need Developer Mode or admin; without them they fail with `EPERM`. Folders use junctions and files fall back to hard links, in `NodeFileSystem`. A hard link has no target, so "linked" means same file identity (`Entry.identity`).
- A save that renames over a hard link splits it. That is reported as a conflict, never repaired by overwriting.
- A home folder holds the registry (`NTUSER.DAT` and friends). `mirrorEntries` must never touch them.
- The variable is `Path`, not `PATH`, so environments merge through `mergeEnvironment`.
- npm installs `.cmd` shims, which only run through `cmd.exe`; `spawnCommandOf` handles it, and refuses an argument with a character `cmd.exe` would interpret. Do not add escaping: refusal is the safe failure.
- `cmd` errors are translated, so never match their text. Use exit codes.
- OpenSSH for Windows mangles a command that starts with a bare `cmd`: `cmd /c ver` fails and `cmd.exe /c ver` works. Always write `cmd.exe`.
- In `cmd`, `if a b & c` runs `c` inside the `if`. Wrap each conditional in parentheses.
- A running `.exe` cannot be overwritten, but it can be renamed.
- Claude installs to `~/.local/bin`, off the PATH, so favo adds that folder. npm's OpenCode is 1.x, with no `--standalone` and a different `auth list`.

Run `bun test` on Windows too. `cmd.exe` and NTFS have caught what no Unix test could.

## Checklist

1. Shared is an allowlist. Never add a credential, a session or a cache.
2. Status never reads a token file.
3. Never move a seat folder. A rename only changes `accountNames` in `config.json`, because the keychain login and the path pasted into T3 Code both depend on the folder.
4. Update this table with what you verified, and how.
