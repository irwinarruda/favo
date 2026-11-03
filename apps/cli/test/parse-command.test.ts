import { describe, expect, it } from 'bun:test';
import { encodeArguments } from '@favo/domain/terminal/terminal-plan';
import { CommandKind, parseCommand } from '@/parse-command';

describe('going back to a thread', () => {
  it('parses a resume, with or without a thread', () => {
    expect(parseCommand(['resume', 'claude', 'work'])).toMatchObject({
      kind: 'resume',
      account: 'work',
      provider: 'claude',
      target: undefined,
    });
    expect(parseCommand(['resume', 'codex', 'work', '2'])).toMatchObject({ provider: 'codex', target: '2' });
  });
  it('hands everything after the seat and the thread to the provider', () => {
    expect(parseCommand(['resume', 'claude', 'work', '--model', 'x'])).toMatchObject({
      target: undefined,
      args: ['--model', 'x'],
    });
    expect(parseCommand(['resume', 'claude', 'work', '2', '-m', 'x', 'go on'])).toMatchObject({
      target: '2',
      machineId: undefined,
      args: ['-m', 'x', 'go on'],
    });
  });
  it('takes a folder and a machine before the seat', () => {
    expect(parseCommand(['--dir', '/srv', 'resume', '-m', 'devbox', 'claude', 'work'])).toMatchObject({
      kind: CommandKind.resume,
      directory: '/srv',
      machineId: 'devbox',
      args: [],
    });
  });
  it('needs a seat', () => {
    expect(() => parseCommand(['resume', 'claude'])).toThrow('Usage: favo resume <provider> <account> [thread]');
    expect(() => parseCommand(['threads'])).toThrow('Usage: favo threads <provider> <account>');
  });
  it('parses the list of threads', () => {
    expect(parseCommand(['threads', 'agy', 'work', '--json'])).toMatchObject({
      kind: 'threads',
      provider: 'antigravity',
      isJson: true,
    });
  });
  it('runs a resume sent over ssh the same way', () => {
    const parsed = parseCommand(['--argv-b64', encodeArguments(['resume', 'claude', 'work', 'abc'])]);
    expect(parsed).toMatchObject({ kind: 'resume', target: 'abc' });
  });
});

describe('favo hooks', () => {
  it('shows the status by default', () => {
    expect(parseCommand(['hooks']).kind).toBe('hooksStatus');
    expect(parseCommand(['hooks', 'status']).kind).toBe('hooksStatus');
  });
  it('installs and uninstalls, here or on another machine', () => {
    expect(parseCommand(['hooks', 'install', '-m', 'devbox'])).toMatchObject({
      kind: 'hooksInstall',
      machineId: 'devbox',
    });
    expect(parseCommand(['hooks', 'uninstall']).kind).toBe('hooksUninstall');
  });
  it('refuses anything else', () => {
    expect(() => parseCommand(['hooks', 'enable'])).toThrow('Unknown hooks command "enable".');
  });
});

describe('parseCommand', () => {
  it('opens the TUI with no arguments', () => {
    expect(parseCommand([]).kind).toBe(CommandKind.tui);
  });
  it('runs a provider as an account', () => {
    expect(parseCommand(['claude', 'work'])).toMatchObject({
      kind: CommandKind.launch,
      provider: 'claude',
      account: 'work',
    });
  });
  it('defaults to personal', () => {
    expect(parseCommand(['codex']).account).toBe('personal');
  });
  it('accepts agy and antigravity for the same provider', () => {
    expect(parseCommand(['agy', 'work']).provider).toBe('antigravity');
    expect(parseCommand(['antigravity', 'work']).provider).toBe('antigravity');
  });
  it('hands everything after the account to the provider, untouched', () => {
    expect(parseCommand(['claude', 'match', '--chrome'])).toMatchObject({ account: 'match', args: ['--chrome'] });
    expect(parseCommand(['codex', 'work', '-m', 'gpt-5', 'fix the bug', '--json'])).toMatchObject({
      account: 'work',
      machineId: undefined,
      isJson: false,
      args: ['-m', 'gpt-5', 'fix the bug', '--json'],
    });
  });
  it('reads a flag right after the provider as the provider own, as personal', () => {
    expect(parseCommand(['claude', '--chrome', 'work'])).toMatchObject({
      account: 'personal',
      args: ['--chrome', 'work'],
    });
  });
  it('leaves help and version after the seat to the provider', () => {
    expect(parseCommand(['codex', 'work', '-h'])).toMatchObject({ kind: CommandKind.launch, args: ['-h'] });
    expect(parseCommand(['claude', '--version'])).toMatchObject({ kind: CommandKind.launch, args: ['--version'] });
    expect(parseCommand(['--help', 'claude']).kind).toBe(CommandKind.help);
  });
  it('still ends the seat at --', () => {
    expect(parseCommand(['claude', 'work', '--', '--resume', '-c']).args).toEqual(['--resume', '-c']);
    expect(parseCommand(['claude', '--', 'fix it'])).toMatchObject({ account: 'personal', args: ['fix it'] });
    expect(parseCommand(['claude', 'work', '--', '--', 'x']).args).toEqual(['--', 'x']);
  });
  it('opens a desktop app as an account', () => {
    expect(parseCommand(['app', 'codex', 'work'])).toMatchObject({
      kind: CommandKind.app,
      account: 'work',
      provider: 'codex',
      canClose: false,
    });
  });
  it('closes the app first only when told to', () => {
    expect(parseCommand(['app', 'claude', 'work', '--close']).canClose).toBe(true);
  });
  it('refuses to open a window on another machine, before asking that machine anything', () => {
    expect(() => parseCommand(['app', 'claude', 'work', '--machine', 'devbox'])).toThrow('takes no --machine');
    expect(parseCommand(['app', 'claude', 'work', '--machine', 'local']).kind).toBe(CommandKind.app);
  });
  it('needs a provider and an account to open an app', () => {
    expect(() => parseCommand(['app', 'claude'])).toThrow('favo app <provider> <account>');
  });
  it('reads usage, for every machine or for one', () => {
    expect(parseCommand(['usage'])).toMatchObject({ kind: CommandKind.usage, isJson: false, machineId: undefined });
    expect(parseCommand(['usage', '--machine', 'devbox', '--json'])).toMatchObject({
      kind: CommandKind.usage,
      isJson: true,
      machineId: 'devbox',
    });
  });
  it('takes a machine anywhere before the seat', () => {
    expect(parseCommand(['list', '--json']).isJson).toBe(true);
    expect(parseCommand(['add', 'side', '-m', 'devbox']).machineId).toBe('devbox');
    expect(parseCommand(['--machine', 'devbox', 'claude', 'work']).machineId).toBe('devbox');
  });
  it('reads seat commands', () => {
    expect(parseCommand(['login', 'agy', 'work'])).toMatchObject({
      kind: CommandKind.login,
      account: 'work',
      provider: 'antigravity',
    });
    expect(parseCommand(['path', 'codex', 'work']).kind).toBe(CommandKind.path);
  });
  it('reads adopt with its folder', () => {
    expect(parseCommand(['adopt', 'claude', 'work', '~/.claude-work'])).toMatchObject({
      kind: CommandKind.adopt,
      account: 'work',
      from: '~/.claude-work',
    });
  });
  it('reads machine commands', () => {
    expect(parseCommand(['machine']).kind).toBe(CommandKind.machineList);
    expect(parseCommand(['machine', 'add', 'bee@devbox', '--name', 'box'])).toMatchObject({
      kind: CommandKind.machineAdd,
      target: 'bee@devbox',
      name: 'box',
    });
    expect(parseCommand(['machine', 'rm', 'box']).kind).toBe(CommandKind.machineRemove);
    expect(parseCommand(['machine', 'update']).kind).toBe(CommandKind.machineUpdate);
    expect(parseCommand(['update'])).toMatchObject({ kind: CommandKind.update, isFavoSkipped: false, isHeld: false });
    expect(parseCommand(['update', '--machine', 'devbox']).machineId).toBe('devbox');
    expect(parseCommand(['update', '--skip-favo', '--hold'])).toMatchObject({ isFavoSkipped: true, isHeld: true });
    expect(() => parseCommand(['update', 'claude'])).toThrow('favo update --machine <machine>');
    expect(parseCommand(['rename', 'work', 'side'])).toMatchObject({
      kind: CommandKind.rename,
      account: 'work',
      name: 'side',
    });
    expect(() => parseCommand(['rename', 'work'])).toThrow('favo rename <account> <new name>');
  });
  it('takes the folder to start in, and keeps it out of the provider arguments', () => {
    const command = parseCommand(['--dir', '/srv/app', 'claude', 'work', '--', '-c']);
    expect(command).toMatchObject({ directory: '/srv/app', args: ['-c'] });
  });
  it('reads theme commands', () => {
    expect(parseCommand(['theme'])).toMatchObject({ kind: CommandKind.theme, target: undefined });
    expect(parseCommand(['theme', 'nord'])).toMatchObject({ kind: CommandKind.theme, target: 'nord' });
  });
  it('reads arguments that crossed ssh encoded, exactly as they were sent', () => {
    const prompt = 'a" & calc & "b\n$(calc) %PATH% it\'s';
    const sent = ['--dir', '/srv/my app', '-m', 'devbox', 'claude', 'work', '--', '-p', prompt];
    const command = parseCommand(['--argv-b64', encodeArguments(sent)]);
    expect(command).toMatchObject({
      kind: CommandKind.launch,
      provider: 'claude',
      account: 'work',
      directory: '/srv/my app',
      machineId: 'devbox',
      args: ['-p', prompt],
    });
  });
  it('reads the same command from encoded and plain arguments', () => {
    const plain = ['login', 'agy', 'work'];
    expect(parseCommand(['--argv-b64', encodeArguments(plain)])).toEqual(parseCommand(plain));
  });
  it('refuses encoded arguments it cannot trust, with a clear error', () => {
    const message = '--argv-b64 takes the base64url of a JSON array of strings.';
    expect(() => parseCommand(['--argv-b64', '{}'])).toThrow(message);
    expect(() => parseCommand(['--argv-b64', btoa('{"a":1}')])).toThrow(message);
    expect(() => parseCommand(['--argv-b64', btoa('[1]')])).toThrow(message);
    expect(() => parseCommand(['--argv-b64'])).toThrow('Usage: favo --argv-b64 <base64url>');
    expect(() => parseCommand(['--argv-b64', 'W10', 'list'])).toThrow('Usage: favo --argv-b64 <base64url>');
  });
  it('decodes once, so an encoded value cannot smuggle another', () => {
    const inner = encodeArguments(['list']);
    expect(() => parseCommand(['--argv-b64', encodeArguments(['--argv-b64', inner])])).toThrow(
      'Unknown flag "--argv-b64".'
    );
  });
  it('treats the flag as text anywhere else', () => {
    expect(() => parseCommand(['list', '--argv-b64', 'W10'])).toThrow('Unknown flag "--argv-b64".');
    expect(parseCommand(['claude', '--', '--argv-b64', 'x']).args).toEqual(['--argv-b64', 'x']);
  });
  it('reads serve for the other side of ssh', () => {
    expect(parseCommand(['serve', '--stdio']).kind).toBe(CommandKind.serve);
  });
  it('gives usage instead of guessing', () => {
    expect(() => parseCommand(['add'])).toThrow('Usage: favo add <account>');
    expect(() => parseCommand(['login', 'claude'])).toThrow('Usage');
    expect(() => parseCommand(['login', 'gemini', 'work'])).toThrow('Unknown provider');
    expect(() => parseCommand(['login', 'work', 'claude'])).toThrow(
      'Unknown provider "work". Usage: favo login <provider> <account>'
    );
    expect(() => parseCommand(['fly'])).toThrow('Unknown command');
    expect(() => parseCommand(['list', '--nope'])).toThrow('Unknown flag');
  });
});
