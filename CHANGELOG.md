# Changelog

## [Unreleased]

### Added

- See how much limit every seat has left and when it comes back, on every machine, in one screen. Press `u` in the comb, or run `favo usage`, which also takes `--machine <machine>` and `--json`. favo reads every machine once when the TUI opens, so the numbers are ready when you press `u`. It covers Claude Code and Codex, and reads them through their own commands. OpenCode and Antigravity show no limits for now, because favo never reads a token.

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

[Unreleased]: https://github.com/irwinarruda/favo-cli/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/irwinarruda/favo-cli/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/irwinarruda/favo-cli/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/irwinarruda/favo-cli/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/irwinarruda/favo-cli/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/irwinarruda/favo-cli/releases/tag/v0.1.0
