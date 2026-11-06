import type {
  DesktopAppSpec,
  DesktopLaunch,
  WindowsFolderApp,
  WindowsPackagedApp,
} from '@favo/domain/desktop/desktop-app';
import { assertDomain, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { EntryKind } from '@favo/domain/sharing/shared-item';
import { DesktopApps, type InstalledDesktopApp } from '@/modules/desktop/gateways/desktop-apps';
import { waitUntil } from '@/modules/desktop/utils/wait-until';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';

const CloseTimeoutMs = 3000;
const StopTimeoutMs = 5000;
const PowerShellTimeoutMs = 15_000;

export class WindowsDesktopApps extends DesktopApps {
  readonly canOpen = true;

  constructor(
    private readonly processes: ProcessRunner,
    private readonly fileSystem: FileSystem,
    private readonly localAppData: string,
    private readonly closeTimeoutMs = CloseTimeoutMs,
    private readonly stopTimeoutMs = StopTimeoutMs
  ) {
    super();
  }

  async find(spec: DesktopAppSpec) {
    const { windows } = spec;
    return 'packageName' in windows ? this.findPackage(spec, windows) : this.findInFolder(spec, windows);
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
    const pid = this.processes.detach({
      command: launcher,
      args: args.map(backslashes),
      env: Object.fromEntries(Object.entries(env).map(([name, value]) => [name, value && backslashes(value)])),
    });
    assertDomain(pid !== undefined, DomainErrorCode.desktopAppFailed, `Could not start ${spec.label}.`);
  }

  defaultProfile({ windows }: DesktopAppSpec) {
    if (!windows.defaultProfile) return undefined;
    return `${forwardSlashes(this.localAppData)}/${windows.defaultProfile}`;
  }

  private async findPackage(spec: DesktopAppSpec, { packageName, alias, executable }: WindowsPackagedApp) {
    const { code, stdout } = await this.powershell(`(Get-AppxPackage -Name ${quoted(packageName)}).InstallLocation`);
    const location = stdout.split(/\r?\n/)[0]?.trim();
    if (code !== 0 || !location) return undefined;
    return {
      spec,
      launcher: `${backslashes(this.localAppData)}\\Microsoft\\WindowsApps\\${alias}`,
      executables: [`${location}\\${executable}`],
    };
  }

  private async findInFolder(spec: DesktopAppSpec, { folder, executable, requiredFile }: WindowsFolderApp) {
    const location = `${forwardSlashes(this.localAppData)}/${folder}`;
    const entry = await this.fileSystem.entry(`${location}/${requiredFile}`);
    if (entry.kind !== EntryKind.file) return undefined;
    const path = backslashes(`${location}/${executable}`);
    return { spec, launcher: path, executables: [path] };
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

function forwardSlashes(path: string) {
  return path.replaceAll('\\', '/');
}

function backslashes(path: string) {
  return path.replaceAll('/', '\\');
}
