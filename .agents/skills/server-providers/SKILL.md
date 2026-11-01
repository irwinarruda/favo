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

## Usage

`ProviderCli.usage` reads limits through the official CLI, never a token. Claude Code and Codex override it; the default answers `unsupported`, so OpenCode and Antigravity need no code. Verified on 2026-11-01 on real seats with Claude Code 2.1.316 and Codex 0.164.0: both answered in about 2 seconds with their own numbers, and no thread, project folder or process stayed behind.

- **Claude Code:** `claude -p --input-format stream-json --output-format stream-json --verbose --no-session-persistence --setting-sources local`, then `initialize` and `get_usage` with `skip_behaviors: true` as `control_request` lines. Nothing is sent to a model. This is an unstable API the Agent SDK marks experimental, so parse loosely and turn anything unexpected into `probeFailed`. `resets_at` has microseconds and an offset, so normalize it. `model_scoped` holds the per-model weeks.
- **Claude Code environment:** an `ANTHROPIC_API_KEY` around makes a subscription seat look like an API key seat, so `usageEnvironment` clears every `CLAUDE*`, `ANTHROPIC*` and `HERDR*` variable, then the seat's own `CLAUDE_CONFIG_DIR` goes back in. The login check of a read uses that same environment, or a shell started inside one seat reports another seat's login. It runs from `~/.favo/empty` so no project settings load.
- **Codex:** `account/rateLimits/read` on `app-server`. `primary` and `secondary` are positions, so read the kind from `windowDurationMins`. `resetsAt` is epoch seconds, unlike Claude. The answer also holds reset credits, which favo ignores. `usageEnvironment` clears `CODEX_HOME`, for the same reason as Claude's. An API key seat has no limits to read: Codex 0.164.0's binary text says `chatgpt authentication required to read rate limits`, so a refused read asks `account/read` and answers `unsupported` for `apiKey`. That comes from the binary's text and T3, and was not run on a real API key seat.
- **Antigravity:** `agy` was not installed on the machine used, so whether `agy models` reports quota is still unknown.

## Desktop apps

`DesktopAppSpecs` in `packages/domain/src/desktop/desktop-app.ts` is a table entry like `Providers`. Each app keeps its local data in one folder, and favo points it at `accounts/<account>/<profileFolder>`, which it never reads. `personal` passes nothing, so it is the default folder. Methods are `hub` because the window opens on the computer you are at; there is no remote case and no `Protocol` bump.

| App     | Facts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude  | Electron. `--user-data-dir` moves the folder. Signed builds log and ignore `CLAUDE_USER_DATA_DIR`, so the flag could go too. `CLAUDE_CONFIG_DIR` is for the Claude Code inside it. Linux: `/usr/lib/claude-desktop/claude-desktop`, Ubuntu and Debian only. Windows package `Claude`, alias `claude-desktop.exe`.                                                                                                                                                                                          |
| ChatGPT | The merged ChatGPT and Codex app. Its bundle id is `com.openai.codex`; `com.openai.chat` is ChatGPT Classic, which cannot be isolated, so never match by name. Its own demo launcher sets `CODEX_HOME`, `CODEX_ELECTRON_USER_DATA_PATH` and `--user-data-dir` together; favo copies that line, so its Codex sign-in lives in the seat, not in that folder. Linux: `/usr/lib/chatgpt/ChatGPT`, reached through a script at `/usr/bin/chatgpt`. Windows package `OpenAI.Codex`, alias `chatgpt-desktop.exe`. |

- Read from the app code on macOS, the official `.deb` file lists and `AppxManifest.xml` on Windows 11. **A real launch and quit of either app has not been run**, so try `favo app work claude` after an app update changes anything here.
- Windows: `claude.exe` is both the app and Claude Code, and `taskkill /IM` is case insensitive, so always match a process by its full path. Run the app through its execution alias, not from `WindowsApps`. `Bun.which` cannot see an alias and `stat` fails with `EACCES`, so ask `Get-AppxPackage`. `Bun.spawn` runs an alias only when it is given `env`; `BunProcessRunner` always does. Never `await exited` on an unref'd child: on Windows it hangs.
- Only the current user's processes count, through `ps x`: another user's app cannot be closed from here. `ps -e` lists them too.
- Closing: macOS and Linux send `SIGTERM` to the main process and report an error if it stays, never `SIGKILL`. Windows has no such signal and closing a window can hide the app in the tray, so favo asks the windows to close, waits, then stops the process.

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
