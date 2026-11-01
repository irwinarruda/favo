import { describe, expect, it } from 'bun:test';
import { detectRemoteSystem, installPlanFor, ProbeCommands } from '#domain/machines/remote-commands';

describe('detectRemoteSystem', () => {
  it('reads Unix from uname', () => {
    expect(detectRemoteSystem({ uname: 'Linux x86_64', ver: '' })).toBe('posix');
    expect(detectRemoteSystem({ uname: 'Darwin arm64', ver: '' })).toBe('posix');
  });
  it('reads Windows when uname is not there', () => {
    const ver = '\r\nMicrosoft Windows [Version 10.0.26200.6899]\r\n';
    expect(detectRemoteSystem({ uname: '', ver })).toBe('windows');
  });
  it('assumes Unix when nothing answers', () => {
    expect(detectRemoteSystem({ uname: '', ver: '' })).toBe('posix');
  });
});

describe('ProbeCommands', () => {
  it('names cmd.exe in full, because OpenSSH for Windows mangles a bare cmd', () => {
    expect(ProbeCommands.windows).toBe('cmd.exe /c ver');
    expect(installPlanFor('windows', '').prepare).not.toStartWith('cmd /c');
    expect(installPlanFor('windows', '').activate).not.toStartWith('cmd /c');
  });
});

describe('installPlanFor', () => {
  it('keeps the Unix steps', () => {
    const plan = installPlanFor('posix', 'Linux x86_64');
    expect(plan.assetName).toBe('favo-linux-x64');
    expect(plan.stagedPath).toBe('.favo/bin/favo.new');
    expect(plan.activate).toContain('ln -sf');
  });
  it('uses the Windows binary and cmd', () => {
    const plan = installPlanFor('windows', '');
    expect(plan.assetName).toBe('favo-windows-x64.exe');
    expect(plan.stagedPath).toBe('.favo/bin/favo.exe.new');
    expect(plan.prepare).toStartWith('cmd.exe /c');
  });
  it('moves a running favo.exe aside, because Windows cannot overwrite it', () => {
    const { activate } = installPlanFor('windows', '');
    const asideAt = activate.indexOf('favo.exe.old >nul');
    const swapAt = activate.indexOf('favo.exe.new .favo');
    expect(asideAt).toBeGreaterThan(0);
    expect(swapAt).toBeGreaterThan(asideAt);
  });
  it('wraps each conditional, because cmd would swallow the rest of the line into the if', () => {
    const { activate } = installPlanFor('windows', '');
    for (const step of activate.slice('cmd.exe /c "'.length, -1).split(' & ')) {
      if (step.includes('if exist')) expect(step).toMatch(/^\(if exist .*\)$/);
    }
  });
  it('encodes the PATH change as UTF-16, as PowerShell expects', () => {
    const [, encoded] = /-EncodedCommand (\S+)/.exec(installPlanFor('windows', '').activate)!;
    const bytes = Uint8Array.from(atob(encoded!), (character) => character.charCodeAt(0));
    expect(new TextDecoder('utf-16le').decode(bytes)).toContain("GetEnvironmentVariable('Path', 'User')");
  });
});
