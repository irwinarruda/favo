import { describe, expect, it } from 'bun:test';
import {
  decodeArguments,
  encodeArguments,
  favoArgumentsFor,
  hasProvidersIn,
  remoteTerminalPlan,
  spawnCommandOf,
  TerminalAction,
  updateArgumentsFor,
} from '#domain/terminal/terminal-plan';

const Hostile = [
  'a" & calc & "b',
  '%PATH%',
  '$(calc)',
  '`calc`',
  "it's",
  "\\'; calc; echo '",
  'two\nlines',
  'ölá 🐝',
  '',
];

describe('terminal plans', () => {
  it('resumes on another machine through favo there, which holds the thread', () => {
    const resume = { action: TerminalAction.resume, account: 'work', provider: 'claude', args: [] };
    expect(favoArgumentsFor(resume)).toEqual(['resume', 'claude', 'work']);
    expect(favoArgumentsFor({ ...resume, thread: 'abc', directory: '/srv' })).toEqual([
      '--dir',
      '/srv',
      'resume',
      'claude',
      'work',
      'abc',
    ]);
    expect(favoArgumentsFor({ ...resume, args: ['--model', 'x'] })).toEqual([
      'resume',
      'claude',
      'work',
      '--',
      '--model',
      'x',
    ]);
  });
  it('runs a remote action through favo on that machine', () => {
    const plan = remoteTerminalPlan('bee@devbox', undefined, ['claude', 'work']);
    expect(plan.command).toBe('ssh');
    const encoded = encodeArguments(['claude', 'work']);
    expect(plan.args).toEqual(['-t', '--', 'bee@devbox', `~/.favo/bin/favo --argv-b64 ${encoded}`]);
  });
  it('keeps every remote argument out of the reach of the shell on the other side', () => {
    for (const system of [undefined, 'posix', 'windows'] as const) {
      const command = remoteTerminalPlan('bee@box', system, ['claude', 'work', '--', ...Hostile]).args.at(-1)!;
      expect(command).toMatch(/^(?:~\/\.favo\/bin\/favo|\.favo\\bin\\favo\.exe) --argv-b64 [A-Za-z0-9_-]+$/);
    }
  });
  it('puts the target behind the end of the ssh options', () => {
    expect(remoteTerminalPlan('bee@box', undefined, []).args.slice(0, 3)).toEqual(['-t', '--', 'bee@box']);
  });
  it('brings every argument back exactly as it was sent', () => {
    expect(decodeArguments(encodeArguments(Hostile))).toEqual(Hostile);
    const longPrompt = 'y'.repeat(300_000);
    expect(decodeArguments(encodeArguments([longPrompt]))).toEqual([longPrompt]);
  });
  it('starts with a letter, so an encoded value can never look like a flag', () => {
    for (const value of Hostile) expect(encodeArguments([value])).toMatch(/^[A-Za-z]/);
  });
  it.each([
    ['nothing', ''],
    ['text that is not base64', 'not base64!'],
    ['the base64 alphabet instead of base64url', 'W10+/w'],
    ['padding', 'W10='],
    ['invalid text', '_w'],
    ['something that is not JSON', btoa('hello')],
    ['an object', btoa('{"a":1}')],
    ['a string', btoa('"claude"')],
    ['null', btoa('null')],
    ['an array with a number', btoa('["claude",1]')],
    ['a nested array', btoa('[["claude"]]')],
  ])('refuses %s where it expects encoded arguments', (_name, encoded) => {
    expect(() => decodeArguments(encoded)).toThrow('--argv-b64 takes the base64url of a JSON array of strings.');
  });
  it('carries the launch folder to the other machine', () => {
    const base = { account: 'work', provider: 'claude', args: ['-c'], action: TerminalAction.launch };
    expect(favoArgumentsFor({ ...base, directory: '/srv/app' })).toEqual([
      '--dir',
      '/srv/app',
      'claude',
      'work',
      '--',
      '-c',
    ]);
  });
  it('runs a Windows machine with its own path', () => {
    const args = ['claude', 'work', '--', 'hi there'];
    const encoded = encodeArguments(args);
    const plan = remoteTerminalPlan('bee@winbox', 'windows', args);
    expect(plan.args).toEqual(['-t', '--', 'bee@winbox', `.favo\\bin\\favo.exe --argv-b64 ${encoded}`]);
  });
  it('runs a .cmd shim through cmd, which Windows requires', () => {
    expect(spawnCommandOf('C:\\npm\\codex.cmd', ['login'])).toEqual([
      'cmd.exe',
      '/d',
      '/c',
      'C:\\npm\\codex.cmd',
      'login',
    ]);
    expect(spawnCommandOf('/usr/bin/claude', ['login'])).toEqual(['/usr/bin/claude', 'login']);
  });
  it.each(['"', '&', '|', '<', '>', '^', '%', '!'])(
    'refuses %s on its way through cmd.exe, and names it',
    (character) => {
      const launch = () => spawnCommandOf('C:\\npm\\claude.cmd', ['-p', `x${character}calc`]);
      expect(launch).toThrow(`An argument contains ${character}. claude.cmd runs through cmd.exe`);
      expect(launch).toThrow(expect.objectContaining({ code: 'unsafeArgument' }));
    }
  );
  it.each(['one\rtwo', 'one\ntwo', 'one\r\ntwo'])('refuses a line break on its way through cmd.exe', (argument) => {
    expect(() => spawnCommandOf('claude.CMD', [argument])).toThrow('An argument contains a line break.');
  });
  it('treats .bat like .cmd, in any case', () => {
    expect(() => spawnCommandOf('C:\\tools\\CLAUDE.BAT', ['x&calc'])).toThrow('CLAUDE.BAT runs through cmd.exe');
  });
  it('still runs a shim whose arguments are harmless', () => {
    const args = ['--resume', 'abc', 'hello world', 'C:\\Users\\bee', 'a=b,c;d'];
    expect(spawnCommandOf('claude.cmd', args)).toEqual(['cmd.exe', '/d', '/c', 'claude.cmd', ...args]);
  });
  it('lets those characters through when no cmd.exe is involved', () => {
    expect(spawnCommandOf('C:\\bin\\claude.exe', ['x&calc'])).toEqual(['C:\\bin\\claude.exe', 'x&calc']);
    expect(spawnCommandOf('/usr/bin/claude', ['two\nlines'])).toEqual(['/usr/bin/claude', 'two\nlines']);
  });
  it('turns each action into the favo command that performs it', () => {
    const base = { account: 'work', provider: 'claude', args: [] };
    expect(favoArgumentsFor({ ...base, action: TerminalAction.login })).toEqual(['login', 'claude', 'work']);
    expect(favoArgumentsFor({ ...base, action: TerminalAction.logout })).toEqual(['logout', 'claude', 'work']);
    expect(favoArgumentsFor({ ...base, action: TerminalAction.launch })).toEqual(['claude', 'work']);
    expect(favoArgumentsFor({ ...base, args: ['-c'], action: TerminalAction.launch })).toEqual([
      'claude',
      'work',
      '--',
      '-c',
    ]);
  });
});

describe('the arguments of a second favo update', () => {
  it('skips the favo that was just updated and goes on to the provider CLIs, as every favo before did', () => {
    expect(updateArgumentsFor({ isHereOnly: false, hasProviders: true })).toEqual(['update', '--skip-favo']);
  });
  it('stays on this computer when asked', () => {
    expect(updateArgumentsFor({ isHereOnly: true, hasProviders: true })).toEqual([
      'update',
      '--skip-favo',
      '--machine',
      'local',
    ]);
  });
  it('says when favo alone was asked for', () => {
    expect(updateArgumentsFor({ isHereOnly: false, hasProviders: false })).toEqual([
      'update',
      '--skip-favo',
      '--favo-only',
    ]);
  });
  it('can hold the report on screen', () => {
    expect(updateArgumentsFor({ isHereOnly: true, hasProviders: true, isHeld: true }).at(-1)).toBe('--hold');
  });
});

describe('whether an update goes on to the provider CLIs', () => {
  it('does only when asked, when you type it', () => {
    expect(hasProvidersIn({ isFavoSkipped: false, hasProviders: false, isFavoOnly: false })).toBe(false);
    expect(hasProvidersIn({ isFavoSkipped: false, hasProviders: true, isFavoOnly: false })).toBe(true);
  });
  it('does for a second update, since an older favo asks for the provider CLIs that way', () => {
    expect(hasProvidersIn({ isFavoSkipped: true, hasProviders: false, isFavoOnly: false })).toBe(true);
  });
  it('does not for a second update that was told favo alone', () => {
    expect(hasProvidersIn({ isFavoSkipped: true, hasProviders: false, isFavoOnly: true })).toBe(false);
  });
});
