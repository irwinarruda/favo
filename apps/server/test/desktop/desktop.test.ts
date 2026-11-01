import { describe, expect, it } from 'bun:test';
import { createAccount } from '@favo/contracts/rpc/accounts/create-account';
import { listDesktopApps } from '@favo/contracts/rpc/desktop/list-desktop-apps';
import { openDesktopApp } from '@favo/contracts/rpc/desktop/open-desktop-app';
import { addMachine } from '@favo/contracts/rpc/machines/add-machine';
import { EntryKind } from '@favo/domain/sharing/shared-item';
import { createTestServer, Home, seedClaudeBase } from '#test/support/test-server';

const openWork = { account: 'work', provider: 'claude', canClose: false } as const;

async function serverWithWork() {
  const server = createTestServer();
  await seedClaudeBase(server.fileSystem);
  await server.client.call(createAccount, { name: 'work' });
  return server;
}

describe('which apps favo offers', () => {
  it('offers none when none is installed', async () => {
    const { client } = createTestServer();
    expect(await client.call(listDesktopApps, {})).toEqual([]);
  });
  it('offers only the ones it found', async () => {
    const { client, desktopApps } = createTestServer();
    desktopApps.install('codex');
    expect(await client.call(listDesktopApps, {})).toEqual([{ provider: 'codex', label: 'ChatGPT' }]);
  });
  it('never offers one for a provider that has no app', async () => {
    const { client, desktopApps } = createTestServer();
    desktopApps.install('opencode');
    desktopApps.install('antigravity');
    expect(await client.call(listDesktopApps, {})).toEqual([]);
  });
  it('answers for this computer, whatever machine is asked about', async () => {
    const { client, desktopApps } = createTestServer();
    desktopApps.install('claude');
    await client.call(addMachine, { target: 'bee@devbox' });
    const apps = await client.call(listDesktopApps, {}, { machineId: 'devbox' });
    expect(apps).toEqual([{ provider: 'claude', label: 'Claude' }]);
  });
});

describe('opening an app', () => {
  it('refuses when the app is not installed, and touches nothing', async () => {
    const { client, desktopApps, fileSystem } = await serverWithWork();
    await expect(client.call(openDesktopApp, openWork)).rejects.toMatchObject({ code: 'desktopAppMissing' });
    expect(desktopApps.opened).toEqual([]);
    expect((await fileSystem.entry(`${Home}/.favo/accounts/work/claude-app`)).kind).toBe(EntryKind.missing);
  });
  it('refuses a provider that has no app', async () => {
    const { client } = await serverWithWork();
    const params = { ...openWork, provider: 'opencode' } as const;
    await expect(client.call(openDesktopApp, params)).rejects.toMatchObject({ code: 'desktopAppMissing' });
  });
  it('refuses an account that does not exist', async () => {
    const { client, desktopApps } = await serverWithWork();
    desktopApps.install('claude');
    const params = { ...openWork, account: 'ghost' };
    await expect(client.call(openDesktopApp, params)).rejects.toMatchObject({ code: 'accountNotFound' });
    expect(desktopApps.opened).toEqual([]);
  });
  it('opens an account in its own folder, with its seat', async () => {
    const { client, desktopApps, fileSystem } = await serverWithWork();
    desktopApps.install('claude');
    const profile = `${Home}/.favo/accounts/work/claude-app`;
    expect(await client.call(openDesktopApp, openWork)).toEqual({ opening: 'opened', label: 'Claude' });
    expect(desktopApps.opened).toEqual([
      {
        provider: 'claude',
        launch: {
          args: [`--user-data-dir=${profile}`],
          env: { CLAUDE_CONFIG_DIR: `${Home}/.favo/accounts/work/claude` },
        },
      },
    ]);
    expect((await fileSystem.entry(profile)).kind).toBe(EntryKind.directory);
  });
  it('links the shared files first, so the app sees the same setup as the CLI', async () => {
    const { client, desktopApps, fileSystem } = await serverWithWork();
    desktopApps.install('claude');
    await client.call(openDesktopApp, openWork);
    expect((await fileSystem.entry(`${Home}/.favo/accounts/work/claude/CLAUDE.md`)).kind).toBe(EntryKind.link);
  });
  it('opens personal in the default folder', async () => {
    const { client, desktopApps, fileSystem } = await serverWithWork();
    desktopApps.install('claude');
    await client.call(openDesktopApp, { ...openWork, account: 'personal' });
    expect(desktopApps.opened[0]?.launch.args).toEqual([]);
    expect((await fileSystem.entry(`${Home}/.favo/accounts/personal`)).kind).toBe(EntryKind.missing);
  });
  it('asks first when the app is open, and closes nothing', async () => {
    const { client, desktopApps } = await serverWithWork();
    desktopApps.install('claude');
    desktopApps.run('claude');
    expect(await client.call(openDesktopApp, openWork)).toEqual({ opening: 'stillOpen', label: 'Claude' });
    expect(desktopApps.quitCalls).toEqual([]);
    expect(desktopApps.opened).toEqual([]);
  });
  it('sets nothing up while it is only asking', async () => {
    const { client, desktopApps, fileSystem } = await serverWithWork();
    desktopApps.install('claude');
    desktopApps.run('claude');
    await client.call(openDesktopApp, openWork);
    expect((await fileSystem.entry(`${Home}/.favo/accounts/work/claude/CLAUDE.md`)).kind).toBe(EntryKind.missing);
    expect((await fileSystem.entry(`${Home}/.favo/accounts/work/claude-app`)).kind).toBe(EntryKind.missing);
  });
  it('closes nothing when the account cannot be opened anyway', async () => {
    const { client, desktopApps } = await serverWithWork();
    desktopApps.install('claude');
    desktopApps.run('claude');
    const params = { ...openWork, account: 'ghost', canClose: true };
    await expect(client.call(openDesktopApp, params)).rejects.toMatchObject({ code: 'accountNotFound' });
    expect(desktopApps.quitCalls).toEqual([]);
  });
  it('closes the app and reopens it once told to', async () => {
    const { client, desktopApps } = await serverWithWork();
    desktopApps.install('claude');
    desktopApps.run('claude');
    const result = await client.call(openDesktopApp, { ...openWork, canClose: true });
    expect(result.opening).toBe('opened');
    expect(desktopApps.quitCalls).toEqual(['claude']);
    expect(desktopApps.opened).toHaveLength(1);
  });
  it('opens nothing when the app refuses to close', async () => {
    const { client, desktopApps } = await serverWithWork();
    desktopApps.install('claude');
    desktopApps.run('claude');
    desktopApps.refuseToQuit('claude');
    const params = { ...openWork, canClose: true };
    await expect(client.call(openDesktopApp, params)).rejects.toMatchObject({ code: 'desktopAppStuck' });
    expect(desktopApps.opened).toEqual([]);
  });
  it('leaves another provider app alone', async () => {
    const { client, desktopApps } = await serverWithWork();
    desktopApps.install('claude');
    desktopApps.install('codex');
    desktopApps.run('codex');
    await client.call(openDesktopApp, { ...openWork, canClose: true });
    expect(desktopApps.quitCalls).toEqual([]);
  });
});
