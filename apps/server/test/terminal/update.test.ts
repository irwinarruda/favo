import { describe, expect, it } from 'bun:test';
import { Protocol, type RpcRequest } from '@favo/contracts/rpc/envelope';
import { addMachine } from '@favo/contracts/rpc/machines/add-machine';
import { planFavoUpdate } from '@favo/contracts/rpc/updates/plan-favo-update';
import { planUpdate } from '@favo/contracts/rpc/updates/plan-update';
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
  it('restarts from the link Homebrew moves, not from the old version folder', async () => {
    const plan = await (await homebrewServer()).client.call(planFavoUpdate, {});
    expect(plan.restart?.command).toBe('/opt/homebrew/bin/favo');
  });
  it('runs the npm that holds the launcher', async () => {
    const plan = await launcherServer().client.call(planFavoUpdate, {});
    expect(plan.upgrade?.command).toBe(`${Home}/.nvm/versions/node/v24.16.0/bin/npm`);
    expect(plan.upgrade?.args).toEqual(['install', '--global', 'favo-cli@latest']);
  });
  it('restarts through the launcher, which fetches the new binary', async () => {
    const plan = await launcherServer().client.call(planFavoUpdate, {});
    expect(plan.restart).toMatchObject({ command: LauncherEnv.FAVO_LAUNCHER_NODE, args: [Launcher] });
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
  it('holds the report on screen when the TUI asks', async () => {
    const plan = await (await fleet(FavoVersion)).client.call(planUpdate, { machineId: 'devbox', isHeld: true });
    expect(decodeArguments(plan.args[3]!.split(' ').at(-1)!)).toContain('--hold');
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
  it('refuses a machine it does not know', async () => {
    await expect(createTestServer().client.call(planUpdate, { machineId: 'nope' })).rejects.toMatchObject({
      code: 'machineNotFound',
    });
  });
});
