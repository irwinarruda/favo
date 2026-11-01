import { describe, expect, it } from 'bun:test';
import { DesktopApps, desktopLaunchOf, desktopProfileOf, mainProcessIds } from '#domain/desktop/desktop-app';
import { Providers } from '#domain/providers/provider';

const paths = { accounts: '/h/.favo/accounts' };
const claude = DesktopApps.claude!;
const chatgpt = DesktopApps.codex!;

describe('desktop apps', () => {
  it('exist only for the providers that ship one', () => {
    expect(Object.keys(DesktopApps).toSorted()).toEqual(['claude', 'codex']);
  });
  it('keep their folder apart from the provider folder, so a cell can hold both', () => {
    for (const spec of [claude, chatgpt]) {
      expect(spec.profileFolder).not.toBe(spec.provider);
      expect(Providers[spec.provider].shared).not.toContain(spec.profileFolder);
    }
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
