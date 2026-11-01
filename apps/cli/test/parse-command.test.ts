import { describe, expect, it } from 'bun:test';
import { encodeArguments } from '@favo/domain/terminal/terminal-plan';
import { CommandKind, parseCommand } from '@/parse-command';

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
  it('hands everything after -- to the provider, flags included', () => {
    expect(parseCommand(['claude', 'work', '--', '--resume', '-c']).args).toEqual(['--resume', '-c']);
  });
  it('opens a desktop app as an account', () => {
    expect(parseCommand(['app', 'work', 'codex'])).toMatchObject({
      kind: CommandKind.app,
      account: 'work',
      provider: 'codex',
      shouldClose: false,
    });
  });
  it('closes the app first only when told to', () => {
    expect(parseCommand(['app', 'work', 'claude', '--close']).shouldClose).toBe(true);
  });
  it('needs an account and a provider to open an app', () => {
    expect(() => parseCommand(['app', 'work'])).toThrow('favo app <account> <provider>');
  });
  it('takes a machine anywhere', () => {
    expect(parseCommand(['list', '--json']).isJson).toBe(true);
    expect(parseCommand(['add', 'side', '-m', 'devbox']).machineId).toBe('devbox');
    expect(parseCommand(['--machine', 'devbox', 'claude', 'work']).machineId).toBe('devbox');
  });
  it('reads seat commands', () => {
    expect(parseCommand(['login', 'work', 'agy'])).toMatchObject({
      kind: CommandKind.login,
      account: 'work',
      provider: 'antigravity',
    });
    expect(parseCommand(['path', 'work', 'codex']).kind).toBe(CommandKind.path);
  });
  it('reads adopt with its folder', () => {
    expect(parseCommand(['adopt', 'work', 'claude', '~/.claude-work'])).toMatchObject({
      kind: CommandKind.adopt,
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
    expect(parseCommand(['rename', 'work', 'side'])).toMatchObject({
      kind: CommandKind.rename,
      account: 'work',
      name: 'side',
    });
    expect(() => parseCommand(['rename', 'work'])).toThrow('favo rename <account> <new name>');
  });
  it('takes the folder to start in, and keeps it out of the provider arguments', () => {
    const command = parseCommand(['claude', 'work', '--dir', '/srv/app', '--', '-c']);
    expect(command).toMatchObject({ directory: '/srv/app', args: ['-c'] });
  });
  it('reads theme commands', () => {
    expect(parseCommand(['theme'])).toMatchObject({ kind: CommandKind.theme, target: undefined });
    expect(parseCommand(['theme', 'nord'])).toMatchObject({ kind: CommandKind.theme, target: 'nord' });
  });
  it('reads arguments that crossed ssh encoded, exactly as they were sent', () => {
    const prompt = 'a" & calc & "b\n$(calc) %PATH% it\'s';
    const sent = ['claude', 'work', '--dir', '/srv/my app', '-m', 'devbox', '--', '-p', prompt];
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
    const plain = ['login', 'work', 'agy'];
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
    expect(() => parseCommand(['login', 'work'])).toThrow('Usage');
    expect(() => parseCommand(['login', 'work', 'gemini'])).toThrow('Unknown provider');
    expect(() => parseCommand(['fly'])).toThrow('Unknown command');
    expect(() => parseCommand(['list', '--nope'])).toThrow('Unknown flag');
  });
});
