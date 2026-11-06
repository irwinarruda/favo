import { describe, expect, it } from 'bun:test';
import { Protocol, type RpcRequest } from '@favo/contracts/rpc/envelope';
import { addMachine } from '@favo/contracts/rpc/machines/add-machine';
import { listProviderVersions } from '@favo/contracts/rpc/updates/list-provider-versions';
import { planFavoUpdate } from '@favo/contracts/rpc/updates/plan-favo-update';
import { planUpdate } from '@favo/contracts/rpc/updates/plan-update';
import { startProviderUpdates } from '@favo/contracts/rpc/updates/start-provider-updates';
import { FavoVersion } from '@favo/contracts/version';
import { decodeArguments } from '@favo/domain/terminal/terminal-plan';
import { createTestServer, Home } from '#test/support/test-server';

const HomebrewBinary = '/opt/homebrew/bin/favo';
const CellarBinary = '/opt/homebrew/Cellar/favo-cli/0.4.0/bin/favo';
const RuntimeBinary = `${Home}/.favo/runtime/0.4.0/favo`;
const Launcher = `${Home}/.nvm/versions/node/v24.16.0/lib/node_modules/favo-cli/bin/favo.mjs`;
const LauncherEnv = { FAVO_LAUNCHER: Launcher, FAVO_LAUNCHER_NODE: `${Home}/.nvm/versions/node/v24.16.0/bin/node` };

async function homebrewServer() {
  const server = createTestServer({ binary: HomebrewBinary, installed: [] });
  await server.fileSystem.link(CellarBinary, HomebrewBinary);
  server.processes.install('brew', '/opt/homebrew/bin/brew');
  return server;
}

function launcherServer(callerEnv: Record<string, string> = LauncherEnv) {
  const server = createTestServer({ binary: RuntimeBinary, installed: [], callerEnv });
  server.processes.install('npm', `${Home}/.nvm/versions/node/v24.16.0/bin/npm`);
  return server;
}

describe('updating favo on this computer', () => {
  it('runs Homebrew for a Homebrew favo, naming only favo', async () => {
    const plan = await (await homebrewServer()).client.call(planFavoUpdate, {});
    expect(plan.installedWith).toBe('Homebrew formula favo-cli');
    expect([plan.upgrade?.command, ...(plan.upgrade?.args ?? [])]).toEqual([
      '/opt/homebrew/bin/brew',
      'upgrade',
      '--formula',
      'favo-cli',
    ]);
  });
  it('has Homebrew fetch the tap first, or a release from the last day stays out of sight', async () => {
    const plan = await (await homebrewServer()).client.call(planFavoUpdate, {});
    expect(plan.upgrade?.env.HOMEBREW_AUTO_UPDATE_SECS).toBe('0');
    expect(plan.upgrade?.unsetEnv).toEqual(['HOMEBREW_NO_AUTO_UPDATE']);
  });
  it('restarts from the link Homebrew moves, not from the old version folder', async () => {
    const plan = await (await homebrewServer()).client.call(planFavoUpdate, {});
    expect(plan.restart?.command).toBe('/opt/homebrew/bin/favo');
  });
  it('runs the npm that holds the launcher', async () => {
    const plan = await launcherServer().client.call(planFavoUpdate, {});
    expect(plan.upgrade?.command).toBe(`${Home}/.nvm/versions/node/v24.16.0/bin/npm`);
    expect(plan.upgrade?.args).toEqual(['install', '--global', 'favo-cli@latest']);
    expect(plan.upgrade?.unsetEnv).toEqual([]);
  });
  it('restarts through the launcher, which fetches the new binary', async () => {
    const plan = await launcherServer().client.call(planFavoUpdate, {});
    expect(plan.restart).toMatchObject({ command: LauncherEnv.FAVO_LAUNCHER_NODE, args: [Launcher] });
  });
  it('restarts pnpm through the stable path, because the real one holds the old version', async () => {
    const stable = `${Home}/.local/share/pnpm/global/5/node_modules/favo-cli`;
    const versioned = `${Home}/.local/share/pnpm/global/5/.pnpm/favo-cli@0.4.0/node_modules/favo-cli`;
    const server = launcherServer({ ...LauncherEnv, FAVO_LAUNCHER: `${stable}/bin/favo.mjs` });
    await server.fileSystem.link(versioned, stable);
    const plan = await server.client.call(planFavoUpdate, {});
    expect(plan.installedWith).toBe('pnpm');
    expect(plan.restart?.args).toEqual([`${stable}/bin/favo.mjs`]);
  });
  it('leaves a pinned favo alone', async () => {
    const server = await homebrewServer();
    server.processes.reply('/opt/homebrew/bin/brew list --pinned', { stdout: 'favo-cli\n' });
    const plan = await server.client.call(planFavoUpdate, {});
    expect(plan).toEqual({
      version: FavoVersion,
      installedWith: 'Homebrew formula favo-cli',
      heldBack: 'it is pinned in Homebrew',
    });
  });
  it('has no upgrade when the package manager is gone', async () => {
    const server = createTestServer({ binary: HomebrewBinary, installed: [] });
    await server.fileSystem.link(CellarBinary, HomebrewBinary);
    const plan = await server.client.call(planFavoUpdate, {});
    expect(plan.upgrade).toBeUndefined();
    expect(plan.installedWith).toBe('Homebrew formula favo-cli');
  });
  it('knows nothing to run from source', async () => {
    const server = createTestServer({ installed: [] });
    expect(await server.client.call(planFavoUpdate, {})).toEqual({ version: FavoVersion });
  });
  it('knows nothing to run for a binary another machine put here', async () => {
    const server = createTestServer({ binary: `${Home}/.favo/bin/favo`, installed: [] });
    expect(await server.client.call(planFavoUpdate, {})).toEqual({ version: FavoVersion });
  });
  it('does not trust a launcher left in the environment by another favo', async () => {
    const server = createTestServer({ binary: `${Home}/.favo/bin/favo`, installed: [], callerEnv: LauncherEnv });
    server.processes.install('npm', '/usr/bin/npm');
    expect((await server.client.call(planFavoUpdate, {})).upgrade).toBeUndefined();
  });
  it('knows nothing to run through npx', async () => {
    const launcher = `${Home}/.npm/_npx/a1b2/node_modules/favo-cli/bin/favo.mjs`;
    const server = launcherServer({ ...LauncherEnv, FAVO_LAUNCHER: launcher });
    expect(await server.client.call(planFavoUpdate, {})).toEqual({ version: FavoVersion });
  });
  it('does not take another package in that folder for favo', async () => {
    const server = createTestServer({ binary: '/opt/homebrew/Cellar/other/1.0/bin/favo', installed: [] });
    expect(await server.client.call(planFavoUpdate, {})).toEqual({ version: FavoVersion });
  });
});

describe('updating the provider CLIs on a machine', () => {
  function fakeRemote(version: string, protocol = Protocol) {
    return {
      async send(request: RpcRequest) {
        const result = {
          version,
          protocol,
          hostname: 'devbox',
          platform: 'linux',
          arch: 'x64',
          home: '/h',
          directory: '/h',
        };
        return { id: request.id, ok: true as const, result };
      },
    };
  }

  async function fleet(version: string, protocol?: number) {
    const server = createTestServer({ binary: HomebrewBinary });
    await server.client.call(addMachine, { target: 'bee@devbox' });
    server.remotes.connect('devbox', fakeRemote(version, protocol));
    return server;
  }

  it('runs favo itself on this computer, skipping its own update', async () => {
    const server = createTestServer({ binary: HomebrewBinary });
    expect(await server.client.call(planUpdate, { machineId: 'local' })).toEqual({
      command: HomebrewBinary,
      args: ['update', '--skip-favo', '--machine', 'local'],
      env: {},
      unsetEnv: [],
    });
  });
  it('falls back to the favo on the PATH from source', async () => {
    const plan = await createTestServer().client.call(planUpdate, {});
    expect(plan.command).toBe('favo');
  });
  it('stays attached over ssh on another machine', async () => {
    const server = await fleet(FavoVersion);
    const plan = await server.client.call(planUpdate, { machineId: 'devbox' });
    expect(plan.command).toBe('ssh');
    expect(plan.args.slice(0, 3)).toEqual(['-t', '--', 'bee@devbox']);
    const encoded = plan.args[3]!.split(' ').at(-1)!;
    expect(decodeArguments(encoded)).toEqual(['update', '--skip-favo', '--machine', 'local']);
  });
  it('refuses a machine on an older favo, which has no such command', async () => {
    const server = await fleet('0.0.1');
    await expect(server.client.call(planUpdate, { machineId: 'devbox' })).rejects.toMatchObject({
      code: 'machineOutdated',
      message: 'devbox runs an older favo. To update it: favo machine install devbox',
    });
  });
  it('refuses a machine it cannot reach', async () => {
    const server = createTestServer();
    await server.client.call(addMachine, { target: 'bee@devbox' });
    await expect(server.client.call(planUpdate, { machineId: 'devbox' })).rejects.toMatchObject({
      code: 'machineUnreachable',
    });
  });
  it('passes on why a machine is not usable', async () => {
    const server = createTestServer();
    await server.client.call(addMachine, { target: 'bee@devbox' });
    server.remotes.failure = 'machineNeedsInstall';
    await expect(server.client.call(planUpdate, { machineId: 'devbox' })).rejects.toMatchObject({
      message: 'devbox: scripted failure',
    });
  });
  it('refuses a machine it does not know', async () => {
    await expect(createTestServer().client.call(planUpdate, { machineId: 'nope' })).rejects.toMatchObject({
      code: 'machineNotFound',
    });
  });
});

describe('updating the provider CLIs in the background', () => {
  const FirstPid = 7_000;

  function serverWith(installed: string[], { isFromSource = false } = {}) {
    const server = createTestServer({ binary: isFromSource ? undefined : HomebrewBinary, installed });
    server.processes.reply('/usr/bin/claude --version', { stdout: '2.1.290 (Claude Code)\n' });
    server.processes.reply('/usr/bin/codex --version', { stdout: 'codex-cli 0.164.0\n' });
    return server;
  }

  function startsOf(server: ReturnType<typeof createTestServer>, command = HomebrewBinary) {
    return server.processes.calls.filter((call) => call.command === command).map(({ args }) => args);
  }

  it('starts favo apart from itself, naming each provider CLI installed here', async () => {
    const server = serverWith(['claude', 'codex']);
    expect(await server.client.call(startProviderUpdates, {})).toEqual({
      started: [
        { provider: 'claude', version: '2.1.290' },
        { provider: 'codex', version: '0.164.0' },
      ],
    });
    expect(startsOf(server)).toEqual([
      ['update', '--skip-favo', '--machine', 'local', '--provider', 'claude', '--provider', 'codex'],
    ]);
  });
  it('shows each of them updating at once, from the version it had', async () => {
    const server = serverWith(['claude', 'codex']);
    await server.client.call(startProviderUpdates, {});
    const [claude, codex] = await server.client.call(listProviderVersions, {});
    expect(claude?.lastUpdate).toMatchObject({ state: 'updating', from: '2.1.290' });
    expect(codex?.lastUpdate).toMatchObject({ state: 'updating', from: '0.164.0' });
  });
  it('ties the update to the favo it started, so it reads stopped once that one is gone', async () => {
    const server = serverWith(['claude']);
    await server.client.call(startProviderUpdates, {});
    server.processes.gone.add(FirstPid);
    const [claude] = await server.client.call(listProviderVersions, {});
    expect(claude?.lastUpdate?.state).toBe('stopped');
  });
  it('updates only the provider CLIs it is asked for, and can include running ones', async () => {
    const server = serverWith(['claude', 'codex']);
    await server.client.call(startProviderUpdates, { providers: ['codex'], isRunningIncluded: true });
    expect(startsOf(server)).toEqual([
      ['update', '--skip-favo', '--machine', 'local', '--provider', 'codex', '--update-running'],
    ]);
    const [claude] = await server.client.call(listProviderVersions, {});
    expect(claude?.lastUpdate).toBeUndefined();
  });
  it('leaves alone a provider CLI another favo is still updating', async () => {
    const server = serverWith(['claude', 'codex']);
    await server.client.call(startProviderUpdates, { providers: ['claude'] });
    const { started } = await server.client.call(startProviderUpdates, {});
    expect(started.map(({ provider }) => provider)).toEqual(['codex']);
    expect(startsOf(server).at(-1)).toEqual(['update', '--skip-favo', '--machine', 'local', '--provider', 'codex']);
  });
  it('starts nothing at all when every provider CLI is already updating', async () => {
    const server = serverWith(['claude']);
    await server.client.call(startProviderUpdates, {});
    expect(await server.client.call(startProviderUpdates, {})).toEqual({ started: [] });
    expect(startsOf(server)).toHaveLength(1);
  });
  it('keeps showing a provider CLI whose binary is gone for a moment while it updates', async () => {
    const server = serverWith(['claude']);
    await server.client.call(startProviderUpdates, {});
    server.processes.uninstall('claude');
    const [claude] = await server.client.call(listProviderVersions, {});
    expect(claude).toMatchObject({ provider: 'claude', installedWith: 'being replaced by its update' });
    expect(claude?.version).toBeUndefined();
    expect(claude?.lastUpdate?.state).toBe('updating');
    server.processes.gone.add(FirstPid);
    expect(await server.client.call(listProviderVersions, {})).toEqual([]);
  });
  it('starts nothing when no provider CLI is installed', async () => {
    const server = serverWith([]);
    expect(await server.client.call(startProviderUpdates, {})).toEqual({ started: [] });
    expect(startsOf(server)).toEqual([]);
  });
  it('says so when favo cannot start, and marks nothing as updating', async () => {
    const server = serverWith(['claude']);
    server.processes.failToDetach(HomebrewBinary);
    await expect(server.client.call(startProviderUpdates, {})).rejects.toMatchObject({ code: 'updateNotStarted' });
    const [claude] = await server.client.call(listProviderVersions, {});
    expect(claude?.lastUpdate).toBeUndefined();
  });
  it('falls back to the favo on the PATH from source', async () => {
    const server = serverWith(['claude'], { isFromSource: true });
    await server.client.call(startProviderUpdates, {});
    expect(startsOf(server, 'favo')).toHaveLength(1);
  });
  it('runs on the machine it is sent to', async () => {
    const mac = serverWith(['claude']);
    const devbox = serverWith(['claude']);
    await mac.client.call(addMachine, { target: 'bee@devbox' });
    mac.remotes.connect('devbox', devbox.router);
    await mac.client.call(startProviderUpdates, {}, { machineId: 'devbox' });
    expect(startsOf(devbox)).toHaveLength(1);
    expect(startsOf(mac)).toEqual([]);
  });
});
