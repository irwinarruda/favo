# Changelog

## [Unreleased]

## [0.6.0] - 2026-11-03

### Changed

- Every command that names a seat now takes the provider first, the way starting one always did: `favo resume claude work`, `favo login claude work`, `favo app claude work`, and the same for `logout`, `threads`, `path`, `inspect` and `adopt`. When favo starts a provider, favo's own options such as `--dir` and `--machine` (`-m`) go before it: `favo -m devbox claude work`. Written after the account, they now go to the provider, so `favo codex work -m devbox` asks Codex for a model called devbox.
- A machine on an older favo now shows as outdated, with no accounts, until you update it, because the two versions no longer read each other's commands. `favo update` updates them all.
- A Herdr pane saved by an older favo shows an error when Herdr restarts, instead of going back to its thread. Start that seat again by hand, and Herdr brings it back from then on.

### Fixed

- Options and prompts after the account now reach the provider without `--`: `favo claude work --chrome` runs `claude --chrome` as work, and `favo claude work "fix the bug"` no longer drops the prompt. `--` still works.

## [0.5.0] - 2026-11-02

### Added

- `favo update` now updates everything in one command: favo on this computer through Homebrew or npm, favo on your other machines, then Claude Code, Codex, OpenCode and Antigravity CLI on each one. It shows each provider's version and how it was installed before changing anything, and reports each result. If favo cannot update on this computer, it stops there and leaves your other machines alone. `favo update --machine <machine>` does one machine, and `local` means this computer. In the comb, press `P` to update the provider CLIs of the selected machine.
- `favo update` never touches a provider that is running through favo without asking first. It also leaves a provider alone if you turned its updates off or pinned it in Homebrew, and tells you why.

### Changed

- `favo machine update` now names the machines it skipped because it could not reach them.

### Fixed

- Updating favo on a machine no longer adds provider hooks to it. Hooks that are already there stay current, even if the computer you run the update from has none.

## [0.4.0] - 2026-11-01

### Added

- See how much limit every seat has left and when it comes back, on every machine, in one screen. Press `u` in the comb, or run `favo usage`, which also takes `--machine <machine>` and `--json`. favo reads every machine once when the TUI opens, so the numbers are ready when you press `u`. It covers Claude Code and Codex, and reads them through their own commands. OpenCode and Antigravity show no limits for now, because favo never reads a token.
- favo can now keep your place. Closing a provider no longer loses the thread: press `b` on a seat, or run `favo resume work claude`, to go back to it in its own folder. Anything after `--` goes to the provider, as it does on a launch. `favo threads work claude` lists what a seat kept, and two sessions in one folder are both kept.
- To know which thread you are in, favo adds a small hook to your provider config, but only once you ask: run `favo hooks install`, or say yes when you press `b`. Your own hooks stay as they are, `favo hooks status` shows where things stand, `favo hooks uninstall` takes it out, and `favo sync` keeps it current. Codex asks each seat once to trust the hook. Without the hook, favo falls back to what Codex and OpenCode list themselves, and says that this is a guess.
- Restarting Herdr now brings a favo seat back on the right account. Claude Code and Codex reopen in the same thread, as the same cell, instead of landing in your personal account. This covers seats on this machine; a seat on another machine does not come back yet.

## [0.3.0] - 2026-11-01

### Added

- Open the Claude or ChatGPT desktop app as any account. Press `p` on a seat, or run `favo app work claude`. Each account keeps its own login in the app, and favo only offers this when the app is installed on the computer you are at. If the app is already open, favo asks before closing it; `favo app work claude --close` skips the question.

## [0.2.0] - 2026-10-31

### Added

- favo now notices when another machine runs an older version. It shows `older favo` and the version on that machine, and the machine keeps working until you update it.
- Press `U` to update favo on every machine at once, or `i` on one machine. From the command line, `favo machine update` does the same for every machine, and `favo list` and `favo machine list` show which ones are behind.

## [0.1.2] - 2026-10-31

### Fixed

- The loading message in the add machine, add account and rename dialogs no longer runs into the `esc cancel` hint.

## [0.1.1] - 2026-10-31

### Added

- Install with Homebrew: `brew install irwinarruda/tap/favo-cli`. Every release updates the formula.

### Changed

- The repository is now `irwinarruda/favo-cli`, matching the npm package and the Homebrew formula. The old address redirects.
- The README is now a landing page, with the new logo.

## [0.1.0] - 2026-10-31

### Added

- First release. Run Claude Code, Codex, Antigravity CLI and OpenCode under as many accounts as you have, at the same time, sharing your `CLAUDE.md`, skills and settings.
- Add other machines over ssh or Tailscale. favo installs itself there, and every action works on them.
- A TUI that shows every machine, account and login, plus a command for everything it does.
- Native on macOS, Linux and Windows, installed with `npm install --global favo-cli`.

[Unreleased]: https://github.com/irwinarruda/favo-cli/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/irwinarruda/favo-cli/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/irwinarruda/favo-cli/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/irwinarruda/favo-cli/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/irwinarruda/favo-cli/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/irwinarruda/favo-cli/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/irwinarruda/favo-cli/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/irwinarruda/favo-cli/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/irwinarruda/favo-cli/releases/tag/v0.1.0
