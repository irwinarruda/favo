import { describe, expect, it } from 'bun:test';
import { createAccount } from '@favo/contracts/rpc/accounts/create-account';
import { getAppLogin } from '@favo/contracts/rpc/desktop/get-app-login';
import { listDesktopApps } from '@favo/contracts/rpc/desktop/list-desktop-apps';
import { openDesktopApp } from '@favo/contracts/rpc/desktop/open-desktop-app';
import { addMachine } from '@favo/contracts/rpc/machines/add-machine';
import { LoginState } from '@favo/contracts/rpc/views';
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
    expect(await client.call(listDesktopApps, {})).toEqual([
      { provider: 'codex', label: 'ChatGPT', login: 'sharedWithCli', canOpen: true },
    ]);
  });
  it('still lists the apps without a screen, as over SSH, but says it cannot open them', async () => {
    const { client, desktopApps } = createTestServer();
    desktopApps.install('claude');
    desktopApps.refuseWindows();
    expect(await client.call(listDesktopApps, {})).toEqual([
      { provider: 'claude', label: 'Claude', login: 'separate', canOpen: false },
    ]);
  });
  it('never offers one for a provider that has no app', async () => {
    const { client, desktopApps } = createTestServer();
    desktopApps.install('opencode');
    expect(await client.call(listDesktopApps, {})).toEqual([]);
  });
  it('offers the Antigravity app, which keeps a login of its own in each cell', async () => {
    const { client, desktopApps } = createTestServer();
    desktopApps.install('antigravity');
    expect(await client.call(listDesktopApps, {})).toEqual([
      { provider: 'antigravity', label: 'Antigravity', login: 'separate', canOpen: true },
    ]);
  });
  it('lists the apps of the machine asked about, on that machine', async () => {
    const { client, desktopApps, remotes } = createTestServer();
    const devbox = createTestServer({ hostname: 'devbox' });
    desktopApps.install('codex');
    devbox.desktopApps.install('claude');
    await client.call(addMachine, { target: 'bee@devbox' });
    remotes.connect('devbox', devbox.router);
    const apps = await client.call(listDesktopApps, {}, { machineId: 'devbox' });
    expect(apps).toEqual([{ provider: 'claude', label: 'Claude', login: 'separate', canOpen: true }]);
  });
});

describe('opening an app', () => {
  it('refuses without a screen, as over SSH, and touches nothing', async () => {
    const { client, desktopApps, fileSystem } = await serverWithWork();
    desktopApps.install('claude');
    desktopApps.refuseWindows();
    await expect(client.call(openDesktopApp, openWork)).rejects.toMatchObject({ code: 'desktopAppFailed' });
    expect(desktopApps.opened).toEqual([]);
    expect((await fileSystem.entry(`${Home}/.favo/accounts/work/claude-app`)).kind).toBe(EntryKind.missing);
  });
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
  it('says favo opens Antigravity only on macOS and Windows, rather than that it is missing', async () => {
    const { client, desktopApps } = createTestServer({ platform: 'linux' });
    desktopApps.install('antigravity');
    await client.call(createAccount, { name: 'work' });
    const params = { ...openWork, provider: 'antigravity' } as const;
    await expect(client.call(openDesktopApp, params)).rejects.toMatchObject({
      code: 'desktopAppMissing',
      message: 'favo opens the Antigravity app on macOS and Windows only.',
    });
    expect(desktopApps.opened).toEqual([]);
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
  it('opens Antigravity with its own folder and the home of its seat, where its conversations live', async () => {
    const { client, desktopApps, fileSystem } = await serverWithWork();
    desktopApps.install('antigravity');
    const params = { ...openWork, provider: 'antigravity' } as const;
    expect(await client.call(openDesktopApp, params)).toEqual({ opening: 'opened', label: 'Antigravity' });
    const seat = `${Home}/.favo/accounts/work/antigravity`;
    expect(desktopApps.opened).toEqual([
      {
        provider: 'antigravity',
        launch: {
          args: [`--user-data-dir=${Home}/.favo/accounts/work/antigravity-app`],
          env: { HOME: seat, USERPROFILE: seat, WSL_INTEROP: 'favo' },
        },
      },
    ]);
    expect((await fileSystem.entry(`${Home}/.favo/accounts/work/antigravity-app`)).kind).toBe(EntryKind.directory);
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

describe('the login of a seat app', () => {
  const workProfile = `${Home}/.favo/accounts/work/claude-app`;
  const workLogin = { account: 'work', provider: 'claude' } as const;

  function appSettings(isSignedIn: boolean, accountUuid = 'uuid-work') {
    const tokens = { 'oauth:tokenCache': 'v10sealed', 'oauth:tokenCacheV2': 'v10sealed' };
    return JSON.stringify({ ...tokens, windowSizeWasSignedIn: isSignedIn, lastKnownAccountUuid: accountUuid });
  }

  function cliConfig(accountUuid: string) {
    return JSON.stringify({ oauthAccount: { accountUuid, emailAddress: 'bee@work.dev' }, projects: {} });
  }

  it('is signed in when the app in that seat says so, and keeps nothing else from its settings', async () => {
    const { client, fileSystem } = await serverWithWork();
    await fileSystem.writePrivateText(`${workProfile}/config.json`, appSettings(true));
    await fileSystem.writePrivateText(`${Home}/.favo/accounts/work/claude/.claude.json`, cliConfig('uuid-work'));
    expect(await client.call(getAppLogin, workLogin)).toEqual({ login: 'signedIn', isOtherAccount: false });
  });
  it('is read without a screen too, as over SSH', async () => {
    const { client, desktopApps, fileSystem } = await serverWithWork();
    desktopApps.refuseWindows();
    await fileSystem.writePrivateText(`${workProfile}/config.json`, appSettings(true));
    await fileSystem.writePrivateText(`${Home}/.favo/accounts/work/claude/.claude.json`, cliConfig('uuid-work'));
    expect(await client.call(getAppLogin, workLogin)).toEqual({ login: 'signedIn', isOtherAccount: false });
  });
  it('is signed out after a sign-out in the app', async () => {
    const { client, fileSystem } = await serverWithWork();
    await fileSystem.writePrivateText(`${workProfile}/config.json`, appSettings(false));
    expect(await client.call(getAppLogin, workLogin)).toEqual({ login: 'signedOut', isOtherAccount: false });
  });
  it('is signed out for a seat the app never opened as', async () => {
    const { client } = await serverWithWork();
    expect(await client.call(getAppLogin, workLogin)).toEqual({ login: 'signedOut', isOtherAccount: false });
  });
  it('is unknown when the app left no flag to read', async () => {
    const { client, fileSystem } = await serverWithWork();
    await fileSystem.ensureDirectory(workProfile);
    expect((await client.call(getAppLogin, workLogin)).login).toBe('unknown');
  });
  it('says so when the app and Claude Code are signed in to different accounts', async () => {
    const { client, fileSystem } = await serverWithWork();
    await fileSystem.writePrivateText(`${workProfile}/config.json`, appSettings(true, 'uuid-personal'));
    await fileSystem.writePrivateText(`${Home}/.favo/accounts/work/claude/.claude.json`, cliConfig('uuid-work'));
    expect(await client.call(getAppLogin, workLogin)).toEqual({ login: 'signedIn', isOtherAccount: true });
  });
  it('reads personal from the default folder and the .claude.json in the home folder', async () => {
    const { client, fileSystem } = await serverWithWork();
    await fileSystem.writePrivateText(`${Home}/.config/Claude/config.json`, appSettings(true, 'uuid-personal'));
    await fileSystem.writePrivateText(`${Home}/.claude.json`, cliConfig('uuid-work'));
    const login = await client.call(getAppLogin, { ...workLogin, account: 'personal' });
    expect(login).toEqual({ login: 'signedIn', isOtherAccount: true });
  });
  it('cannot tell for personal while the app default folder is missing', async () => {
    const { client } = await serverWithWork();
    const login = await client.call(getAppLogin, { ...workLogin, account: 'personal' });
    expect(login).toEqual({ login: 'unknown', isOtherAccount: false });
  });
  it('creates nothing while it reads', async () => {
    const { client, fileSystem } = await serverWithWork();
    await client.call(getAppLogin, workLogin);
    expect((await fileSystem.entry(workProfile)).kind).toBe(EntryKind.missing);
  });
  it('refuses ChatGPT, whose login is the one Codex shows', async () => {
    const { client } = await serverWithWork();
    const params = { ...workLogin, provider: 'codex' } as const;
    await expect(client.call(getAppLogin, params)).rejects.toMatchObject({ code: 'desktopAppMissing' });
  });
  it('refuses a provider that has no app', async () => {
    const { client } = await serverWithWork();
    const params = { ...workLogin, provider: 'opencode' } as const;
    await expect(client.call(getAppLogin, params)).rejects.toMatchObject({ code: 'desktopAppMissing' });
  });
  it('refuses an account that does not exist', async () => {
    const { client } = await serverWithWork();
    const params = { ...workLogin, account: 'ghost' };
    await expect(client.call(getAppLogin, params)).rejects.toMatchObject({ code: 'accountNotFound' });
  });
});

describe('the login of the Antigravity app', () => {
  const workLogin = { account: 'work', provider: 'antigravity' } as const;
  const tokenFile = `${Home}/.favo/accounts/work/antigravity/.gemini/jetski-standalone-oauth-token`;

  it('is signed in when the cell holds its login file, which favo never opens', async () => {
    const { client, fileSystem } = await serverWithWork();
    await fileSystem.writePrivateText(tokenFile, '{"token":"secret"}');
    expect(await client.call(getAppLogin, workLogin)).toEqual({ login: 'signedIn', isOtherAccount: false });
  });
  it('is signed out without that file, whatever agy says', async () => {
    const { client, clis } = await serverWithWork();
    clis.antigravity.login = { login: LoginState.signedIn };
    expect(await client.call(getAppLogin, workLogin)).toEqual({ login: 'signedOut', isOtherAccount: false });
  });
  it('follows agy for personal, because both read your login from the keychain', async () => {
    const { client, clis } = await serverWithWork();
    clis.antigravity.login = { login: LoginState.signedIn };
    const personal = { ...workLogin, account: 'personal' };
    expect(await client.call(getAppLogin, personal)).toEqual({ login: 'signedIn', isOtherAccount: false });
    clis.antigravity.login = { login: LoginState.unknown };
    expect((await client.call(getAppLogin, personal)).login).toBe('unknown');
  });
});
