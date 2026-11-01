# Changelog

Every change people using favo would notice, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/irwinarruda/favo-cli/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/irwinarruda/favo-cli/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/irwinarruda/favo-cli/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/irwinarruda/favo-cli/releases/tag/v0.1.0
