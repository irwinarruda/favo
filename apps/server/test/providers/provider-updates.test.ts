import { describe, expect, it } from 'bun:test';
import { listProviderUpdates } from '@favo/contracts/rpc/updates/list-provider-updates';
import { createTestServer, Home } from '#test/support/test-server';
import { ProviderRunRepository } from '@/modules/providers/repositories/provider-run.repository';

const Brew = '/opt/homebrew/bin/brew';
const CaskClaude = '/opt/homebrew/Caskroom/claude-code@latest/2.1.316/claude';
const FormulaOpencode = '/opt/homebrew/Cellar/opencode-v2/2.2.5/bin/opencode';
const NvmNode = `${Home}/.nvm/versions/node/v24.16.0`;
const NpmCodex = `${NvmNode}/lib/node_modules/@openai/codex/bin/codex.js`;

async function serverWith(links: Record<string, string>, options: Parameters<typeof createTestServer>[0] = {}) {
  const server = createTestServer({ installed: [], ...options });
  for (const [command, target] of Object.entries(links)) {
    const path = `/opt/homebrew/bin/${command}`;
    await server.fileSystem.link(target, path);
    server.processes.install(command, path);
  }
  server.processes.install('brew', Brew);
  return server;
}

function stepsOf(view: { steps: { command: string; args: string[] }[] } | undefined) {
  return view?.steps.map(({ command, args }) => [command, ...args].join(' '));
}

describe('what favo shows before updating', () => {
  it('reports the version and how each provider got here', async () => {
    const server = await serverWith({ claude: CaskClaude, opencode: FormulaOpencode });
    server.processes.reply('/opt/homebrew/bin/claude --version', { stdout: '2.1.316 (Claude Code)\n' });
    server.processes.reply('/opt/homebrew/bin/opencode --version', { stdout: 'opencode v2.2.5\n' });
    const [claude, opencode] = await server.client.call(listProviderUpdates, {});
    expect(claude).toMatchObject({
      provider: 'claude',
      version: '2.1.316',
      installedWith: 'Homebrew cask claude-code@latest',
    });
    expect(opencode).toMatchObject({ version: '2.2.5', installedWith: 'Homebrew formula opencode-v2' });
  });
  it('leaves out a provider that is not installed', async () => {
    const server = await serverWith({ claude: CaskClaude });
    expect((await server.client.call(listProviderUpdates, {})).map(({ provider }) => provider)).toEqual(['claude']);
  });
  it('names a real path when no package manager holds it', async () => {
    const server = await serverWith({ claude: `${Home}/.local/share/claude/versions/2.1.316` });
    const [claude] = await server.client.call(listProviderUpdates, {});
    expect(claude?.installedWith).toBe(`own install at ${Home}/.local/share/claude/versions/2.1.316`);
  });
  it('reports another copy on the PATH without touching it', async () => {
    const server = await serverWith({ claude: CaskClaude });
    server.processes.installIn('/usr/bin', 'claude');
    const [claude] = await server.client.call(listProviderUpdates, {});
    expect(claude?.otherCopies).toEqual(['/usr/bin/claude']);
    expect(claude?.steps.every(({ command }) => command !== '/usr/bin/claude')).toBe(true);
  });
  it('counts a link to the same install as one copy', async () => {
    const server = await serverWith({ claude: CaskClaude });
    await server.fileSystem.link(CaskClaude, '/usr/bin/claude');
    server.processes.installIn('/usr/bin', 'claude');
    const [claude] = await server.client.call(listProviderUpdates, {});
    expect(claude?.otherCopies).toEqual([]);
  });
});

describe('the way each provider updates', () => {
  it('uses the provider, from the binary favo launches', async () => {
    const server = await serverWith({ codex: NpmCodex });
    const [codex] = await server.client.call(listProviderUpdates, {});
    expect(stepsOf(codex)?.[0]).toBe('/opt/homebrew/bin/codex update');
  });
  it('goes straight to Homebrew for Claude Code, which only prints the command there', async () => {
    const server = await serverWith({ claude: CaskClaude });
    const [claude] = await server.client.call(listProviderUpdates, {});
    expect(stepsOf(claude)).toEqual([`${Brew} upgrade --cask claude-code@latest`]);
  });
  it('keeps the package manager as the fallback', async () => {
    const server = await serverWith({ opencode: FormulaOpencode });
    const [opencode] = await server.client.call(listProviderUpdates, {});
    expect(stepsOf(opencode)).toEqual(['/opt/homebrew/bin/opencode upgrade', `${Brew} upgrade --formula opencode-v2`]);
  });
  it('has only the own command when no package manager holds it', async () => {
    const server = await serverWith({ codex: `${Home}/.codex/packages/standalone/codex` });
    const [codex] = await server.client.call(listProviderUpdates, {});
    expect(stepsOf(codex)).toEqual(['/opt/homebrew/bin/codex update']);
  });
  it('uses the package manager for Antigravity, which has no command of its own', async () => {
    const server = await serverWith({
      agy: '/opt/homebrew/Caskroom/antigravity-cli/1.4.12,4768735748292608/antigravity',
    });
    const [agy] = await server.client.call(listProviderUpdates, {});
    expect(stepsOf(agy)).toEqual([`${Brew} upgrade --cask antigravity-cli`]);
  });
  it('offers nothing for an Antigravity no package manager holds', async () => {
    const server = await serverWith({ agy: `${Home}/.local/bin/antigravity` });
    const [agy] = await server.client.call(listProviderUpdates, {});
    expect(agy?.steps).toEqual([]);
  });
  it('never treats a version manager shim as the thing it runs', async () => {
    const server = await serverWith({ claude: '/opt/homebrew/Cellar/mise/2026.10.0/bin/mise' });
    const [claude] = await server.client.call(listProviderUpdates, {});
    expect(stepsOf(claude)).toEqual(['/opt/homebrew/bin/claude update']);
    expect(claude?.installedWith).toStartWith('own install at');
  });
  it('uses the npm of the Node version that holds the install', async () => {
    const server = await serverWith({ codex: NpmCodex });
    server.processes.install('npm', `${NvmNode}/bin/npm`);
    const [codex] = await server.client.call(listProviderUpdates, {});
    expect(stepsOf(codex)?.[1]).toBe(`${NvmNode}/bin/npm install --global @openai/codex@latest`);
    expect(codex?.steps[0]?.env.PATH).toStartWith(`${NvmNode}/bin:`);
    expect(codex?.steps[1]?.env.PATH).toStartWith(`${NvmNode}/bin:`);
  });
  it('joins folders with a semicolon on Windows', async () => {
    const server = await serverWith({ codex: NpmCodex }, { isWindows: true });
    const [codex] = await server.client.call(listProviderUpdates, {});
    expect(codex?.steps[0]?.env.PATH).toContain(`${NvmNode}/bin;${NvmNode};`);
  });
});

describe('what favo leaves alone', () => {
  it('holds back a provider whose updates are off', async () => {
    const server = await serverWith({ claude: CaskClaude });
    server.clis.claude.updateOff = 'DISABLE_UPDATES';
    const [claude] = await server.client.call(listProviderUpdates, {});
    expect(claude?.heldBack).toBe('its updates are turned off by DISABLE_UPDATES');
  });
  it('holds back a formula pinned in Homebrew', async () => {
    const server = await serverWith({ opencode: FormulaOpencode });
    server.processes.reply(`${Brew} list --pinned`, { stdout: 'neovim@0.11.7\nopencode-v2\n' });
    const [opencode] = await server.client.call(listProviderUpdates, {});
    expect(opencode?.heldBack).toBe('it is pinned in Homebrew');
  });
  it('does not mistake another pinned formula for this one', async () => {
    const server = await serverWith({ opencode: FormulaOpencode });
    server.processes.reply(`${Brew} list --pinned`, { stdout: 'opencode\n' });
    const [opencode] = await server.client.call(listProviderUpdates, {});
    expect(opencode?.heldBack).toBeUndefined();
  });
});

describe('a provider running through favo', () => {
  async function running(pid: number) {
    const server = await serverWith({ claude: CaskClaude });
    const runs = new ProviderRunRepository(server.fileSystem, server.processes, server.paths);
    await server.fileSystem.writePrivateText(runs.pidFile('work', 'claude', 'launch-1'), String(pid));
    return { server, runs };
  }

  it('names the accounts it runs as', async () => {
    const { server } = await running(4242);
    const [claude] = await server.client.call(listProviderUpdates, {});
    expect(claude?.runningAccounts).toEqual(['work']);
  });
  it('forgets a launch whose process is gone', async () => {
    const { server, runs } = await running(4242);
    server.processes.gone.add(4242);
    const [claude] = await server.client.call(listProviderUpdates, {});
    expect(claude?.runningAccounts).toEqual([]);
    expect(await server.fileSystem.readText(runs.pidFile('work', 'claude', 'launch-1'))).toBeUndefined();
  });
  it('does not count one provider as another', async () => {
    const { server, runs } = await running(4242);
    await server.fileSystem.link(NpmCodex, '/opt/homebrew/bin/codex');
    server.processes.install('codex', '/opt/homebrew/bin/codex');
    await server.fileSystem.writePrivateText(runs.pidFile('side', 'codex', 'launch-2'), '4343');
    const [claude, codex] = await server.client.call(listProviderUpdates, {});
    expect(claude?.runningAccounts).toEqual(['work']);
    expect(codex?.runningAccounts).toEqual(['side']);
  });
});
