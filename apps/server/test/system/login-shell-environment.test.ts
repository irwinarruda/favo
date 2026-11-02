import { describe, expect, it } from 'bun:test';
import { LoginShellEnvironment, ShellProbe } from '@/modules/system/gateways/login.shell-environment';
import { ScriptedProcessRunner } from '@/modules/system/gateways/scripted.process-runner';

const Marker = '__FAVO_PATH__';

function shellWith(stdout: string) {
  const processes = new ScriptedProcessRunner();
  processes.reply(`/bin/zsh -ilc ${ShellProbe}`, { stdout });
  return new LoginShellEnvironment(processes, '/bin/zsh', '/inherited');
}

describe('the login shell', () => {
  it('gives its PATH, past whatever a startup file prints', async () => {
    const shell = shellWith(
      `welcome back\n${Marker}/opt/homebrew/bin:/usr/bin${Marker}${Marker}${Marker}${Marker}${Marker}${Marker}`
    );
    expect(await shell.path()).toBe('/opt/homebrew/bin:/usr/bin');
  });
  it('falls back to the inherited PATH when it answers nothing', async () => {
    expect(await shellWith('').path()).toBe('/inherited');
  });
  it('gives the variables a provider reads to turn updates off, and only those set', async () => {
    const shell = shellWith(`${Marker}/usr/bin${Marker}1${Marker}${Marker}${Marker}${Marker}/seat${Marker}`);
    expect(await shell.variables()).toEqual({ DISABLE_UPDATES: '1', CLAUDE_CONFIG_DIR: '/seat' });
  });
  it('asks the shell once', async () => {
    const processes = new ScriptedProcessRunner();
    const shell = new LoginShellEnvironment(processes, '/bin/zsh', '/inherited');
    await Promise.all([shell.path(), shell.variables(), shell.path()]);
    expect(processes.calls).toHaveLength(1);
  });
});
