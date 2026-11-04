import { describe, expect, it } from 'bun:test';
import {
  AppLoginState,
  appLoginFilesOf,
  appLoginOf,
  DesktopAppSpecs,
  DesktopLogin,
  desktopLaunchOf,
  desktopProfileOf,
  mainProcessIds,
} from '#domain/desktop/desktop-app';
import { Providers } from '#domain/providers/provider';

const paths = { home: '/h', accounts: '/h/.favo/accounts' };
const claude = DesktopAppSpecs.claude!;
const chatgpt = DesktopAppSpecs.codex!;

describe('desktop apps', () => {
  it('exist only for the providers that ship one', () => {
    expect(Object.keys(DesktopAppSpecs).toSorted()).toEqual(['claude', 'codex']);
  });
  it('never treat a bare chatgpt command as the app, because other tools use that name', () => {
    expect(chatgpt.linux.processNames).toEqual(['/usr/lib/chatgpt/ChatGPT']);
  });
  it('keep their folder apart from the provider folder, so a cell can hold both', () => {
    for (const spec of [claude, chatgpt]) {
      expect(spec.profileFolder).not.toBe(spec.provider);
      expect(Providers[spec.provider].shared).not.toContain(spec.profileFolder);
    }
  });
});

describe('the login of an app', () => {
  const settings = (values: object) => JSON.stringify({ 'oauth:tokenCache': 'v10secret', ...values });
  const opened = { account: 'work', hasProfile: true };
  const cliConfig = (accountUuid: string) =>
    JSON.stringify({ oauthAccount: { accountUuid, emailAddress: 'bee@hive.dev' } });

  it('is the CLI login for ChatGPT, whose Codex signs it in, and its own for Claude', () => {
    expect(chatgpt.login).toBe(DesktopLogin.sharedWithCli);
    expect(claude.login).toBe(DesktopLogin.separate);
  });
  it('is read from the app folder and from the CLI file that holds the account, never a token', () => {
    expect(appLoginFilesOf(paths, 'work', claude, '/p')).toEqual({
      settings: '/p/config.json',
      cliConfig: '/h/.favo/accounts/work/claude/.claude.json',
    });
  });
  it('compares personal with the .claude.json in the home folder, where Claude Code keeps it by default', () => {
    expect(appLoginFilesOf(paths, 'personal', claude, '/p').cliConfig).toBe('/h/.claude.json');
  });
  it('is signed out when the app never opened as that seat, because favo makes that folder when it opens it', () => {
    const login = appLoginOf({ account: 'work', hasProfile: false });
    expect(login).toEqual({ login: AppLoginState.signedOut, isOtherAccount: false });
  });
  it('is unknown for personal without the default folder, which is the app and not favo to make', () => {
    const login = appLoginOf({ account: 'personal', hasProfile: false });
    expect(login).toEqual({ login: AppLoginState.unknown, isOtherAccount: false });
  });
  it('follows the flag the app sets on sign-in and clears on sign-out', () => {
    const signedIn = appLoginOf({ ...opened, settings: settings({ windowSizeWasSignedIn: true }) });
    const signedOut = appLoginOf({ ...opened, settings: settings({ windowSizeWasSignedIn: false }) });
    expect(signedIn).toEqual({ login: AppLoginState.signedIn, isOtherAccount: false });
    expect(signedOut).toEqual({ login: AppLoginState.signedOut, isOtherAccount: false });
  });
  it.each([
    ['no settings yet', undefined],
    ['no flag, as before the first sign-in or after a rename', settings({})],
    ['a flag of another type', settings({ windowSizeWasSignedIn: 'yes' })],
    ['settings that are not JSON', '{oops'],
    ['settings that are not an object', '[true]'],
  ])('is unknown, never signed out, with %s', (_name, text) => {
    expect(appLoginOf({ ...opened, settings: text })).toEqual({
      login: AppLoginState.unknown,
      isOtherAccount: false,
    });
  });
  it('notices the app and the CLI signed in to different accounts', () => {
    const app = settings({ windowSizeWasSignedIn: true, lastKnownAccountUuid: 'app-uuid' });
    expect(appLoginOf({ ...opened, settings: app, cliConfig: cliConfig('cli-uuid') }).isOtherAccount).toBe(true);
    expect(appLoginOf({ ...opened, settings: app, cliConfig: cliConfig('app-uuid') }).isOtherAccount).toBe(false);
  });
  it('does not call a signed out app another account, because its uuid outlives sign-out', () => {
    const app = settings({ windowSizeWasSignedIn: false, lastKnownAccountUuid: 'app-uuid' });
    expect(appLoginOf({ ...opened, settings: app, cliConfig: cliConfig('cli-uuid') }).isOtherAccount).toBe(false);
  });
  it('cannot tell another account without both uuids, so it does not claim one', () => {
    const app = settings({ windowSizeWasSignedIn: true, lastKnownAccountUuid: 'app-uuid' });
    const noUuid = settings({ windowSizeWasSignedIn: true, lastKnownAccountUuid: 42 });
    expect(appLoginOf({ ...opened, settings: app }).isOtherAccount).toBe(false);
    expect(appLoginOf({ ...opened, settings: app, cliConfig: '{}' }).isOtherAccount).toBe(false);
    expect(appLoginOf({ ...opened, settings: noUuid, cliConfig: cliConfig('cli-uuid') })).toEqual({
      login: AppLoginState.signedIn,
      isOtherAccount: false,
    });
  });
});

describe('the profile of an account', () => {
  it('lives in the cell', () => {
    expect(desktopProfileOf(paths, 'work', claude)).toBe('/h/.favo/accounts/work/claude-app');
  });
  it('is the default folder for personal, which is the app you already use', () => {
    expect(desktopProfileOf(paths, 'personal', claude)).toBeUndefined();
  });
});

describe('a launch', () => {
  it('points Claude at its folder and its Claude Code at the seat', () => {
    expect(desktopLaunchOf(claude, '/seat', '/profile')).toEqual({
      args: ['--user-data-dir=/profile'],
      env: { CLAUDE_CONFIG_DIR: '/seat' },
    });
  });
  it('gives ChatGPT the same folder both ways, as its own launch line does', () => {
    expect(desktopLaunchOf(chatgpt, '/seat', '/profile')).toEqual({
      args: ['--user-data-dir=/profile'],
      env: { CODEX_HOME: '/seat', CODEX_ELECTRON_USER_DATA_PATH: '/profile' },
    });
  });
  it('takes nothing for personal, and clears what favo may have inherited', () => {
    expect(desktopLaunchOf(chatgpt, '/seat')).toEqual({
      args: [],
      env: { CODEX_HOME: undefined, CODEX_ELECTRON_USER_DATA_PATH: undefined },
    });
  });
});

describe('finding the main process', () => {
  const app = '/Applications/Claude.app/Contents/MacOS/Claude';

  it('finds it with or without flags', () => {
    expect(mainProcessIds(`  12 ${app}\n  34 ${app} --user-data-dir=/p`, [app])).toEqual([12, 34]);
  });
  it('leaves the helpers to the main process', () => {
    expect(mainProcessIds(`  12 ${app} --type=renderer`, [app])).toEqual([]);
  });
  it('does not take the Claude Code CLI for the app', () => {
    expect(mainProcessIds('  12 /Users/bee/.local/bin/claude --resume', [app, 'claude-desktop'])).toEqual([]);
  });
  it('does not take a longer name for the app', () => {
    expect(mainProcessIds('  12 /usr/bin/chatgpt-helper', ['/usr/bin/chatgpt'])).toEqual([]);
  });
  it('survives a path with spaces', () => {
    const spaced = '/Users/bee/My Apps/Claude.app/Contents/MacOS/Claude';
    expect(mainProcessIds(` 12 ${spaced} --flag`, [spaced])).toEqual([12]);
  });
});
