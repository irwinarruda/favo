# ⬢ favo

> [!IMPORTANT]
> **favo takes a LOT of inspiration from [Ditto CLI](https://github.com/reyanshgupta/ditto-cli).** The core idea, one folder per account with a named allowlist of symlinks back to your own config, is Ditto's, and so is much of what we know about how each provider behaves. Go look at it. favo is a smaller take on the same idea, in TypeScript, for four providers, with a TUI and remote machines at its center.

favo means honeycomb in Portuguese and Italian. Each account is a sealed cell with its own login and threads. The walls between cells are shared: your CLAUDE.md, skills and settings. It keeps every AI subscription you have on every computer you own, without logging in and out.

```text
  ⬢ favo                                               2 hives · 3 cells · 5 signed in

 ╭─ ⬢ macbook · this machine ───────────────────────╮ ╭─ cell ──────────────────────╮
 │ personal base            work                    │ │  ⬢ Claude Code as work      │
 │   ⬢ claude   me@gmail    ▸ ⬢ claude   me@work    │ │  me@work                    │
 │   ⬢ codex    me@gmail      ⬡ codex    sign in    │ │  team                       │
 ╰──────────────────────────────────────────────────╯ │                             │
 ╭─ ⬢ devbox · bee@devbox ──────────────────────────╮ │  CONFIG PATH · press c      │
 │ personal base                                    │ │  ~/.favo/accounts/work/...  │
 │   ⬢ claude   me@gmail                            │ │  T3 Code: CLAUDE_CONFIG_DIR │
 ╰──────────────────────────────────────────────────╯ ╰─────────────────────────────╯
  enter launch  c copy path  a account  m machine  r refresh  ? help  q quit
```

## How it works

`personal` is the labs' own `~/.claude`, `~/.codex` and so on. It is the base, and favo never moves it. Every other account lives here, and a provider's folder appears the first time you use it:

```text
~/.favo/accounts/
  work/
    claude/    CLAUDE_CONFIG_DIR points here
    codex/     CODEX_HOME points here
  side/
    claude/
```

Inside, an item is either **shared** or **private**. Shared is a named list per provider, linked back to your base, so you edit a skill once and every account sees it. Everything else is private, so a credential file can never leak between accounts, even one a provider adds next year.

Two limits are worth knowing. Shared files really are shared, so an API key you keep in `settings.json` or `config.toml` reaches every account. And Antigravity runs in a private `HOME` that mirrors your real one: its own `.gemini` folder follows the list, but it can still see the rest of your home folder, including `~/.ssh`.

Links are checked at launch and with `favo sync`. There is no schedule, because a symlink cannot go stale. A real file where a link belongs is reported and left alone.

favo never reads a token. Logins run the official commands with the right folder set.

| Provider        | Separated by                                      | Shared                                                                     |
| --------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| Claude Code     | `CLAUDE_CONFIG_DIR`                               | CLAUDE.md, settings, skills, agents, commands, hooks, plugins, keybindings |
| Codex           | `CODEX_HOME`                                      | AGENTS.md, config.toml, hooks.json, skills, agents, rules, prompts         |
| Antigravity CLI | a private `HOME` that mirrors yours               | GEMINI.md, settings, skills, plugins                                       |
| OpenCode        | `XDG_DATA_HOME`, `XDG_STATE_HOME`, `--standalone` | all of its config, left where it is                                        |

> [!WARNING]
> Antigravity keeps conversations separate per account, but favo could not verify that its login is separate too. The TUI says so on that seat.

## Install

```sh
npm install -g favo-cli
```

The package is `favo-cli` and the command is `favo`. Use `npx favo-cli` to try it. Plain `npx favo` runs an unrelated package.

favo needs Node 20.11 or newer. The first run downloads the binary for your platform, about 40 MB, from the GitHub Release, checks it against the hashes in the npm package, and keeps it in `~/.favo/runtime`. It runs on macOS, on Linux with glibc, and on x64 Windows. Alpine and Windows on ARM are not supported yet.

To update, run `npm install -g favo-cli@latest`, then `favo machine install <machine>` for each other machine.

To build from source:

```sh
bun install --os='*' --cpu='*'
bun run build:all
bun run install:local
```

## Use

```sh
favo                         # open the comb
favo add work                # a new cell
favo login work claude       # sign in, with the official command
favo claude work             # run Claude Code as work
favo claude work -- --resume # everything after -- goes to the provider
favo path work claude        # the path to paste into T3 Code
favo list                    # every machine, account and login
favo rename work client      # a new name, on this machine
favo rm work                 # move a cell to the trash
```

In the comb, press `n` to rename the selected cell and `x` to delete it. The base cell can be renamed but never deleted. A rename only changes the name you see: the folder stays where it is, so logins, threads and paths in T3 Code keep working, and the old name still works in commands. Names live in `accountNames` in `~/.favo/config.json`, per machine.

`favo rm` keeps the cell in `~/.favo/trash`, login included, until you delete that folder yourself.

To move an existing config folder in: `favo adopt work claude ~/.claude-work`. Claude's macOS login is tied to the folder path, so sign in once afterward. favo refuses a folder inside `~/.favo` or a provider's base folder.

To always pass arguments to a provider, add `launchArgs` to `~/.favo/config.json`, as in the example under [Themes](#themes).

## Where a provider starts

A provider launches in the folder you opened favo from. On another machine, that is its home folder. The header always shows it for the selected machine, like `favo in ~/code/app` or `favo on devbox in ~`, the cell panel repeats it under **LAUNCHES IN**, and `favo list` prints it per machine.

To change it, press `d` or click the path. Type a path and folders autocomplete as you go, from the machine you selected, so this browses another computer's real folders over SSH:

| Key         | Does                                                   |
| ----------- | ------------------------------------------------------ |
| `↑` `↓`     | move through the folders                               |
| `tab`       | complete the highlighted folder, or the first match    |
| `enter`     | open the highlighted folder, or use the path you typed |
| `backspace` | after a `/`, go up one level                           |
| `esc`       | close without changing anything                        |

Each machine keeps its own choice until you quit favo. From the command line, use `favo claude work --dir ~/code/app`, which also works with `--machine`.

## Themes

Press `t` to pick a theme with a live preview, or use `favo theme` and `favo theme <name>`. The choice is saved in `~/.favo/config.json`, next to anything else you keep there:

```json
{
  "theme": "tokyo-night",
  "providers": { "claude": { "launchArgs": ["--dangerously-skip-permissions"] } }
}
```

Built in: `honey`, `wax` (light), `catppuccin`, `catppuccin-latte` (light), `dracula`, `everforest`, `gruvbox`, `kanagawa`, `nord`, `one-dark`, `rose-pine`, `tokyo-night`.

A custom theme is a JSON file in `~/.favo/themes`, and its file name is its id. Leave out any color you like and it comes from the theme it extends, `honey` by default:

```json
{
  "name": "Midnight Hive",
  "extends": "tokyo-night",
  "colors": {
    "accent": "#7788FF",
    "background": "#0D0E14"
  }
}
```

Colors are `background`, `panel`, `selection`, `border`, `accent`, `accentBright`, `text`, `muted`, `faint`, `success` and `danger`. A file that does not load is skipped, and favo tells you why.

## In T3 Code

T3 Code starts providers itself, so it only needs the folder. Select a seat, press `c`, and paste into a Claude provider's **CLAUDE_CONFIG_DIR path** or a Codex provider's **CODEX_HOME path**.

## Other machines

```sh
favo machine discover            # what is on ssh and Tailscale
favo machine add bee@devbox      # connect, and install favo there
favo add side --machine devbox   # most commands take --machine
```

To install itself, favo downloads the binary for that machine from the GitHub Release of its own version, checks it, and uploads it over ssh, so the other machine only needs ssh and this one needs internet.

From then on, that machine is in the same view and every action works on it. Launching and signing in hand your terminal to `ssh -t`. There are no ports, tunnels or daemons: favo reaches the other machine's backend through `favo serve --stdio`, and ssh or Tailscale handles identity. Over ssh, Codex signs in with a device code, and Claude gives you a link and asks for the code back.

If a machine shows as outdated, `favo machine install <machine>` updates it. The first ssh connection to a new machine trusts its host key, as ssh's `accept-new` does; a changed key is refused.

## Windows

favo runs natively on Windows, with the same TUI and commands. Install it with npm, or let another machine install it with `favo machine add`.

Windows has three differences worth knowing:

- **Linking.** Without Developer Mode, Windows refuses symlinks. favo shares folders with junctions, which need no permission, and files with hard links. A hard link is shared until a program replaces the file instead of writing to it; favo then reports a conflict and leaves both copies alone. Turn on Developer Mode to get real symlinks, and favo uses them for new links.
- **Arguments.** A provider installed by npm is a `.cmd` file, which only runs through `cmd.exe`. That shell cannot pass some characters safely, so favo refuses an argument containing `"`, `&`, `|`, `<`, `>`, `^`, `%`, `!` or a line break for those providers, and says so.
- **Reaching it.** Tailscale SSH has no server on Windows, so another machine needs the OpenSSH server that ships with it. Install Tailscale first, download [`enable-windows-ssh.ps1`](https://github.com/irwinarruda/favo/blob/main/scripts/enable-windows-ssh.ps1), and run it once in an administrator PowerShell, with the public key of the machine connecting:

```powershell
.\enable-windows-ssh.ps1 -PublicKey "ssh-ed25519 AAAA... you@mac"
```

It installs that key and limits SSH to your Tailscale connection. It does not change `sshd_config`, so password sign-in stays available to anyone on your tailnet unless you turn it off. Windows downloads about 250 MB for this, so it can sit on `Operation Running` for ten minutes; that is normal. Your SSH client may also warn that the connection is not post-quantum, because Windows ships an older server. It is safe to ignore.

## Architecture

```text
packages/domain     pure rules: providers, accounts, link reconciliation, machines
packages/contracts  the RPC language between front ends and the backend
apps/server         the backend: layered modules, a gateway for everything external
apps/client         the TUI: MVVM, with a Zustand application layer and OpenTUI views
apps/cli            the one binary
apps/npm            the favo-cli package: a launcher that fetches the binary
```

The client's application layer knows nothing about the terminal, and it talks to one backend through the contracts, so a web front end can reuse both. `bun run dev:mock` runs the whole TUI with no backend. `bun run verify` is lint, typecheck, test and build.

`AGENTS.md` and `.agents/skills/` describe how to work here.

## License

[MIT](LICENSE), © 2026 Irwin Arruda. [Ditto CLI](https://github.com/reyanshgupta/ditto-cli), which favo owes so much to, is also MIT, © 2026 Reyansh Gupta.
