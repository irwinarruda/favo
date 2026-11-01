import { describe, expect, it } from 'bun:test';
import { AntigravityProviderCli } from '@/modules/providers/gateways/antigravity.provider-cli';
import { ClaudeProviderCli } from '@/modules/providers/gateways/claude.provider-cli';
import { CodexProviderCli } from '@/modules/providers/gateways/codex.provider-cli';
import { OpencodeProviderCli } from '@/modules/providers/gateways/opencode.provider-cli';
import { ScriptedProcessRunner } from '@/modules/system/gateways/scripted.process-runner';

function sessionOf(binary: string) {
  return { binary, env: { PATH: '/usr/bin' } };
}

describe('Claude Code shim', () => {
  const status = 'claude auth status';

  it('reads who is signed in', async () => {
    const processes = new ScriptedProcessRunner();
    const stdout = JSON.stringify({ loggedIn: true, email: 'bee@hive.dev', orgName: 'Hive', subscriptionType: 'max' });
    processes.reply(status, { stdout });
    expect(await new ClaudeProviderCli(processes).status(sessionOf('claude'))).toEqual({
      login: 'signedIn',
      identity: 'bee@hive.dev',
      plan: 'max · Hive',
    });
  });
  it('leaves out the organization every personal plan has', async () => {
    const processes = new ScriptedProcessRunner();
    const stdout = JSON.stringify({ loggedIn: true, orgName: "bee@hive.dev's Organization", subscriptionType: 'max' });
    processes.reply(status, { stdout });
    expect((await new ClaudeProviderCli(processes).status(sessionOf('claude'))).plan).toBe('max');
  });
  it('reads a signed out seat', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply(status, { code: 1, stdout: '{"loggedIn":false}' });
    expect((await new ClaudeProviderCli(processes).status(sessionOf('claude'))).login).toBe('signedOut');
  });
  it('does not guess when the output is unreadable', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply(status, { stdout: 'surprise' });
    expect((await new ClaudeProviderCli(processes).status(sessionOf('claude'))).login).toBe('unknown');
  });
  it('keeps the tmux paste fix the claude wrapper had', () => {
    const cli = new ClaudeProviderCli(new ScriptedProcessRunner());
    expect(cli.launchEnvironment({ TMUX: '/tmp/x' })).toEqual({ env: { TERM: 'xterm-256color' }, unsetEnv: ['TMUX'] });
    expect(cli.launchEnvironment({})).toEqual({ env: {}, unsetEnv: [] });
  });
});

describe('Codex shim', () => {
  const accountLine = (account: unknown) => JSON.stringify({ id: 2, result: { account } });

  it('asks the app server who is signed in instead of reading a token', async () => {
    const processes = new ScriptedProcessRunner();
    processes.converse('codex app-server', [accountLine({ type: 'chatgpt', email: 'bee@hive.dev', planType: 'team' })]);
    expect(await new CodexProviderCli(processes).status(sessionOf('codex'))).toEqual({
      login: 'signedIn',
      identity: 'bee@hive.dev',
      plan: 'team',
    });
  });
  it('reads a signed out seat from the app server', async () => {
    const processes = new ScriptedProcessRunner();
    processes.converse('codex app-server', [accountLine(null)]);
    expect((await new CodexProviderCli(processes).status(sessionOf('codex'))).login).toBe('signedOut');
  });
  it('trusts the app server over login status when the token was revoked', async () => {
    const processes = new ScriptedProcessRunner();
    const revoked = { id: 2, error: { code: -32603, message: 'your refresh token was revoked' } };
    processes.converse('codex app-server', [JSON.stringify(revoked)]);
    processes.reply('codex login status', { stdout: 'Logged in using ChatGPT' });
    expect(await new CodexProviderCli(processes).status(sessionOf('codex'))).toEqual({
      login: 'signedOut',
      plan: 'login expired',
    });
  });
  it('signs in with a device code over ssh, where a localhost callback cannot reach', () => {
    const cli = new CodexProviderCli(new ScriptedProcessRunner());
    expect(cli.loginArguments({ isOverSsh: false })).toEqual(['login']);
    expect(cli.loginArguments({ isOverSsh: true })).toEqual(['login', '--device-auth']);
  });
  it('falls back to login status when the app server is not there', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply('codex login status', { stdout: 'Logged in using ChatGPT' });
    expect((await new CodexProviderCli(processes).status(sessionOf('codex'))).login).toBe('signedIn');
    processes.reply('codex login status', { stdout: 'Not logged in' });
    expect((await new CodexProviderCli(processes).status(sessionOf('codex'))).login).toBe('signedOut');
  });
});

describe('Antigravity shim', () => {
  it('reads sign-in from the models command because agy has no status command', async () => {
    const processes = new ScriptedProcessRunner();
    const cli = new AntigravityProviderCli(processes);
    processes.reply('agy models', { code: 1, stderr: 'Error: Please sign in to view available models.' });
    expect((await cli.status(sessionOf('agy'))).login).toBe('signedOut');
    processes.reply('agy models', { stdout: 'gemini-3' });
    expect((await cli.status(sessionOf('agy'))).login).toBe('signedIn');
  });
  it('signs in by launching and has no sign-out', () => {
    const cli = new AntigravityProviderCli(new ScriptedProcessRunner());
    expect(cli.loginArguments()).toEqual([]);
    expect(cli.logoutArguments()).toBeUndefined();
  });
});

describe('OpenCode shim', () => {
  const help = 'opencode --help';

  it('uses standalone when this version has it, and asks only once', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply(help, { stdout: '--standalone  Run with a private server' });
    processes.reply('opencode auth list --standalone', { stdout: 'OpenAI  OAuth  stored\n' });
    const cli = new OpencodeProviderCli(processes);
    expect((await cli.status(sessionOf('opencode'))).identity).toBe('1 login');
    await cli.status(sessionOf('opencode'));
    expect(processes.calls.filter((call) => call.args[0] === '--help')).toHaveLength(1);
  });
  it('works with a version that has no standalone, as npm ships today', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply(help, { stdout: 'opencode providers  manage AI providers' });
    processes.reply('opencode auth list', { stdout: '\u001b[90m—\u001b[39m  2 credentials\n' });
    const cli = new OpencodeProviderCli(processes);
    expect(await cli.isolationArguments(sessionOf('opencode'))).toEqual([]);
    expect((await cli.status(sessionOf('opencode'))).identity).toBe('2 logins');
  });
  it('counts the logins, through colors', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply(help, { stdout: '--standalone' });
    const stdout = '\u001b[32mGitHub Copilot\u001b[0m  OAuth  stored\nOpenAI  API  stored\n';
    processes.reply('opencode auth list --standalone', { stdout });
    expect((await new OpencodeProviderCli(processes).status(sessionOf('opencode'))).identity).toBe('2 logins');
  });
  it('reads an empty seat from either version', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply('opencode auth list', { stdout: 'No authenticated integrations' });
    expect((await new OpencodeProviderCli(processes).status(sessionOf('opencode'))).login).toBe('signedOut');
    processes.reply('opencode auth list', { stdout: '0 credentials' });
    expect((await new OpencodeProviderCli(processes).status(sessionOf('opencode'))).login).toBe('signedOut');
  });
});
