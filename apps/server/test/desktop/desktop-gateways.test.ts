import { describe, expect, it } from 'bun:test';
import { DesktopApps } from '@favo/domain/desktop/desktop-app';
import type { InstalledDesktopApp } from '@/modules/desktop/gateways/desktop-apps';
import { HeadlessDesktopApps } from '@/modules/desktop/gateways/headless.desktop-apps';
import { LinuxDesktopApps } from '@/modules/desktop/gateways/linux.desktop-apps';
import { MacDesktopApps } from '@/modules/desktop/gateways/mac.desktop-apps';
import { WindowsDesktopApps } from '@/modules/desktop/gateways/windows.desktop-apps';
import { BunProcessRunner } from '@/modules/system/gateways/bun.process-runner';
import { MemoryFileSystem } from '@/modules/system/gateways/memory.file-system';
import type { ProcessRequest } from '@/modules/system/gateways/process-runner';
import { ScriptedProcessRunner } from '@/modules/system/gateways/scripted.process-runner';

const claude = DesktopApps.claude!;
const chatgpt = DesktopApps.codex!;
const ProcessList = 'ps -eo pid=,args=';
const PowerShell = 'powershell.exe -NoProfile -NonInteractive -Command';
const ClaudeBundle = '/Applications/Claude.app';
const ClaudeMain = `${ClaudeBundle}/Contents/MacOS/Claude`;
const WindowsClaude = 'C:\\Program Files\\WindowsApps\\Claude_4_x64__pzs8sxrjxfjjc';

class EndingProcessRunner extends ScriptedProcessRunner {
  override async run(request: ProcessRequest) {
    if (request.command === 'kill') this.reply(ProcessList, { stdout: '' });
    return super.run(request);
  }
}

function plistLine(bundle: string) {
  return `plutil -extract CFBundleIdentifier raw -o - ${bundle}/Contents/Info.plist`;
}

function commandsOf(processes: ScriptedProcessRunner) {
  return processes.calls.map(({ command, args }) => [command, ...args].join(' '));
}

function macApp(): InstalledDesktopApp {
  return { spec: claude, launcher: ClaudeBundle, executables: [ClaudeMain] };
}

describe('on macOS', () => {
  it('finds an app by the id inside its bundle', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply(plistLine(ClaudeBundle), { stdout: 'com.anthropic.claudefordesktop\n' });
    expect(await new MacDesktopApps(processes, '/Users/bee').find(claude)).toEqual(macApp());
  });
  it('looks in your own Applications folder too', async () => {
    const processes = new ScriptedProcessRunner();
    const bundle = '/Users/bee/Applications/Claude.app';
    processes.reply(plistLine(bundle), { stdout: 'com.anthropic.claudefordesktop\n' });
    expect((await new MacDesktopApps(processes, '/Users/bee').find(claude))?.launcher).toBe(bundle);
  });
  it('finds nothing when nothing is installed', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply(plistLine(ClaudeBundle), { code: 1 });
    processes.reply(plistLine('/Users/bee/Applications/Claude.app'), { code: 1 });
    expect(await new MacDesktopApps(processes, '/Users/bee').find(claude)).toBeUndefined();
  });
  it('does not take ChatGPT Classic for the app that can be isolated', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply(plistLine('/Applications/ChatGPT.app'), { stdout: 'com.openai.chat\n' });
    expect(await new MacDesktopApps(processes, '/Users/bee').find(chatgpt)).toBeUndefined();
  });
  it('still finds an older install named Codex', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply(plistLine('/Applications/Codex.app'), { stdout: 'com.openai.codex\n' });
    const app = await new MacDesktopApps(processes, '/Users/bee').find(chatgpt);
    expect(app?.executables).toEqual(['/Applications/Codex.app/Contents/MacOS/Codex']);
  });
  it('opens a new instance with its folder and variables', async () => {
    const processes = new ScriptedProcessRunner();
    await new MacDesktopApps(processes, '/Users/bee').open(macApp(), {
      args: ['--user-data-dir=/p'],
      env: { CLAUDE_CONFIG_DIR: '/seat' },
    });
    expect(commandsOf(processes)).toEqual([
      `open -n --env CLAUDE_CONFIG_DIR=/seat ${ClaudeBundle} --args --user-data-dir=/p`,
    ]);
  });
  it('opens personal the plain way', async () => {
    const processes = new ScriptedProcessRunner();
    await new MacDesktopApps(processes, '/Users/bee').open(macApp(), {
      args: [],
      env: { CLAUDE_CONFIG_DIR: undefined },
    });
    expect(commandsOf(processes)).toEqual([`open ${ClaudeBundle}`]);
  });
  it('says so when macOS will not open it', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply(`open ${ClaudeBundle}`, { code: 1, stderr: 'no such app' });
    const gateway = new MacDesktopApps(processes, '/Users/bee');
    await expect(gateway.open(macApp(), { args: [], env: {} })).rejects.toMatchObject({ code: 'desktopAppFailed' });
  });
  it('tells a running app from a stopped one', async () => {
    const processes = new ScriptedProcessRunner();
    const gateway = new MacDesktopApps(processes, '/Users/bee');
    processes.reply(ProcessList, { stdout: ` 9 /bin/zsh\n 12 ${ClaudeMain} --type=gpu-process\n` });
    expect(await gateway.isRunning(macApp())).toBe(false);
    processes.reply(ProcessList, { stdout: ` 11 ${ClaudeMain}\n` });
    expect(await gateway.isRunning(macApp())).toBe(true);
  });
  it('asks only the main process to quit, and waits for it', async () => {
    const processes = new EndingProcessRunner();
    processes.reply(ProcessList, { stdout: ` 11 ${ClaudeMain}\n 12 ${ClaudeMain} --type=renderer\n 13 /bin/claude\n` });
    expect(await new MacDesktopApps(processes, '/Users/bee', 1000).quit(macApp())).toBe(true);
    expect(commandsOf(processes)).toContain('kill -TERM 11');
  });
  it('reports an app that will not quit, and never forces it', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply(ProcessList, { stdout: ` 11 ${ClaudeMain}\n` });
    expect(await new MacDesktopApps(processes, '/Users/bee', 0).quit(macApp())).toBe(false);
    expect(commandsOf(processes).filter((line) => line.startsWith('kill'))).toEqual(['kill -TERM 11']);
  });
});

describe('on Linux', () => {
  const executable = '/usr/lib/claude-desktop/claude-desktop';

  it('finds the app at its official path', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writePrivateText(executable, '');
    const app = await new LinuxDesktopApps(new ScriptedProcessRunner(), fileSystem).find(claude);
    expect(app).toEqual({
      spec: claude,
      launcher: executable,
      executables: [executable, '/usr/bin/claude-desktop', 'claude-desktop'],
    });
  });
  it('finds nothing without it, even with the same command on the PATH', async () => {
    const processes = new ScriptedProcessRunner();
    processes.install('claude-desktop');
    expect(await new LinuxDesktopApps(processes, new MemoryFileSystem()).find(claude)).toBeUndefined();
  });
  it('sees an app started from the menu, under its short name', async () => {
    const processes = new ScriptedProcessRunner();
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writePrivateText(chatgpt.linux.executable, '');
    const gateway = new LinuxDesktopApps(processes, fileSystem);
    const app = await gateway.find(chatgpt);
    processes.reply(ProcessList, { stdout: ' 40 chatgpt\n' });
    expect(await gateway.isRunning(app!)).toBe(true);
  });
  it('starts the app apart from favo, so it outlives it', async () => {
    const processes = new ScriptedProcessRunner();
    const launch = { args: ['--user-data-dir=/p'], env: { CLAUDE_CONFIG_DIR: '/seat' } };
    const app = { spec: claude, launcher: executable, executables: [executable] };
    await new LinuxDesktopApps(processes, new MemoryFileSystem()).open(app, launch);
    expect(processes.calls).toEqual([{ command: executable, ...launch }]);
  });
  it('says so when the app will not start', async () => {
    const processes = new ScriptedProcessRunner();
    processes.failToDetach(executable);
    const app = { spec: claude, launcher: executable, executables: [executable] };
    const gateway = new LinuxDesktopApps(processes, new MemoryFileSystem());
    await expect(gateway.open(app, { args: [], env: {} })).rejects.toMatchObject({ code: 'desktopAppFailed' });
  });
});

describe('on Windows', () => {
  const app: InstalledDesktopApp = {
    spec: claude,
    launcher: 'C:\\Users\\bee\\AppData\\Local\\Microsoft\\WindowsApps\\claude-desktop.exe',
    executables: [`${WindowsClaude}\\app\\claude.exe`],
  };
  const processesOfClaude = `Get-Process | Where-Object { $_.Path -eq '${WindowsClaude}\\app\\claude.exe' }`;
  const packageLine = `${PowerShell} (Get-AppxPackage -Name 'Claude').InstallLocation`;
  const countLine = `${PowerShell} @(${processesOfClaude}).Count`;
  const localAppData = 'C:/Users/bee/AppData/Local';

  it('finds the app by its package, and starts it through its alias', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply(packageLine, { stdout: `${WindowsClaude}\r\n` });
    expect(await new WindowsDesktopApps(processes, localAppData).find(claude)).toEqual(app);
  });
  it('finds nothing when the package is not installed', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply(packageLine, { stdout: '\r\n' });
    expect(await new WindowsDesktopApps(processes, localAppData).find(claude)).toBeUndefined();
  });
  it('matches the app by its full path, because Claude Code is claude.exe too', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply(countLine, { stdout: '0\r\n' });
    expect(await new WindowsDesktopApps(processes, localAppData).isRunning(app)).toBe(false);
    processes.reply(countLine, { stdout: '15\r\n' });
    expect(await new WindowsDesktopApps(processes, localAppData).isRunning(app)).toBe(true);
    expect(commandsOf(processes).every((line) => !line.includes('-Name'))).toBe(true);
  });
  it('asks the windows to close, and stops only what stayed behind', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply(countLine, { stdout: '0\r\n' });
    expect(await new WindowsDesktopApps(processes, localAppData, 1000, 1000).quit(app)).toBe(true);
    expect(commandsOf(processes)).not.toContain(`${PowerShell} ${processesOfClaude} | Stop-Process -Force`);
  });
  it('stops an app that hides in the tray instead of closing', async () => {
    const processes = new ScriptedProcessRunner();
    processes.reply(countLine, { stdout: '2\r\n' });
    expect(await new WindowsDesktopApps(processes, localAppData, 0, 0).quit(app)).toBe(false);
    expect(commandsOf(processes)).toContain(`${PowerShell} ${processesOfClaude} | Stop-Process -Force`);
  });
  it('turns favo paths into Windows paths for the app', async () => {
    const processes = new ScriptedProcessRunner();
    await new WindowsDesktopApps(processes, localAppData).open(app, {
      args: ['--user-data-dir=C:/Users/bee/.favo/accounts/work/claude-app'],
      env: { CLAUDE_CONFIG_DIR: 'C:/Users/bee/.favo/accounts/work/claude', OTHER: undefined },
    });
    expect(processes.calls).toEqual([
      {
        command: app.launcher,
        args: ['--user-data-dir=C:\\Users\\bee\\.favo\\accounts\\work\\claude-app'],
        env: { CLAUDE_CONFIG_DIR: 'C:\\Users\\bee\\.favo\\accounts\\work\\claude', OTHER: undefined },
      },
    ]);
  });
});

describe('with no screen to open a window on', () => {
  it('finds nothing, so favo offers nothing', async () => {
    expect(await new HeadlessDesktopApps().find()).toBeUndefined();
  });
});

describe.skipIf(process.platform === 'win32')('with real processes', () => {
  it('starts a process apart from favo, sees it, and stops it', async () => {
    const processes = new BunProcessRunner(process.env, false);
    const duration = `${30 + Math.random()}`;
    const gateway = new LinuxDesktopApps(processes, new MemoryFileSystem(), 3000);
    const app = { spec: claude, launcher: '/bin/sleep', executables: [`/bin/sleep ${duration}`] };
    await gateway.open(app, { args: [duration], env: {} });
    await Bun.sleep(100);
    expect(await gateway.isRunning(app)).toBe(true);
    expect(await gateway.quit(app)).toBe(true);
    expect(await gateway.isRunning(app)).toBe(false);
  });
});
