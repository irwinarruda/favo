import type { DesktopAppSpec, DesktopLaunch } from '@favo/domain/desktop/desktop-app';
import { assertDomain, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { DesktopApps, type InstalledDesktopApp } from '@/modules/desktop/gateways/desktop-apps';
import { waitUntil } from '@/modules/desktop/utils/wait-until';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';

const CloseTimeoutMs = 3000;
const StopTimeoutMs = 5000;
const PowerShellTimeoutMs = 15_000;

export class WindowsDesktopApps extends DesktopApps {
  readonly canOpen = true;

  constructor(
    private readonly processes: ProcessRunner,
    private readonly localAppData: string,
    private readonly closeTimeoutMs = CloseTimeoutMs,
    private readonly stopTimeoutMs = StopTimeoutMs
  ) {
    super();
  }

  async find(spec: DesktopAppSpec) {
    const { packageName, alias, executable } = spec.windows;
    const { code, stdout } = await this.powershell(`(Get-AppxPackage -Name ${quoted(packageName)}).InstallLocation`);
    const location = stdout.split(/\r?\n/)[0]?.trim();
    if (code !== 0 || !location) return undefined;
    return {
      spec,
      launcher: `${backslashes(this.localAppData)}\\Microsoft\\WindowsApps\\${alias}`,
      executables: [`${location}\\${executable}`],
    };
  }

  async isRunning(app: InstalledDesktopApp) {
    const { code, stdout } = await this.powershell(`@(${processesOf(app)}).Count`);
    assertDomain(code === 0, DomainErrorCode.desktopAppFailed, `Could not tell whether ${app.spec.label} is open.`);
    return Number(stdout.trim()) > 0;
  }

  async quit(app: InstalledDesktopApp) {
    const isClosed = async () => !(await this.isRunning(app));
    await this.powershell(`${processesOf(app)} | ForEach-Object { [void]$_.CloseMainWindow() }`);
    if (await waitUntil(isClosed, this.closeTimeoutMs)) return true;
    await this.powershell(`${processesOf(app)} | Stop-Process -Force`);
    return waitUntil(isClosed, this.stopTimeoutMs);
  }

  async open({ spec, launcher }: InstalledDesktopApp, { args, env }: DesktopLaunch) {
    const isDetached = this.processes.detach({
      command: launcher,
      args: args.map(backslashes),
      env: Object.fromEntries(Object.entries(env).map(([name, value]) => [name, value && backslashes(value)])),
    });
    assertDomain(isDetached, DomainErrorCode.desktopAppFailed, `Could not start ${spec.label}.`);
  }

  defaultProfile({ windows }: DesktopAppSpec) {
    if (!windows.defaultProfile) return undefined;
    return `${this.localAppData.replaceAll('\\', '/')}/${windows.defaultProfile}`;
  }

  private powershell(script: string) {
    return this.processes.run({
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command', script],
      timeoutMs: PowerShellTimeoutMs,
    });
  }
}

function processesOf({ executables }: InstalledDesktopApp) {
  return `Get-Process | Where-Object { $_.Path -eq ${quoted(executables[0]!)} }`;
}

function quoted(text: string) {
  return `'${text.replaceAll("'", "''")}'`;
}

function backslashes(path: string) {
  return path.replaceAll('/', '\\');
}
