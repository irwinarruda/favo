import type { DesktopAppSpec, DesktopLaunch } from '@favo/domain/desktop/desktop-app';
import { assertDomain, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { EntryKind } from '@favo/domain/sharing/shared-item';
import type { InstalledDesktopApp } from '@/modules/desktop/gateways/desktop-apps';
import { CommandTimeoutMs, UnixDesktopApps } from '@/modules/desktop/gateways/unix.desktop-apps';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';

export class MacDesktopApps extends UnixDesktopApps {
  constructor(
    processes: ProcessRunner,
    private readonly fileSystem: FileSystem,
    private readonly home: string,
    quitTimeoutMs?: number
  ) {
    super(processes, quitTimeoutMs);
  }

  async find(spec: DesktopAppSpec) {
    for (const folder of ['/Applications', `${this.home}/Applications`]) {
      for (const name of spec.mac.appNames) {
        const bundle = `${folder}/${name}.app`;
        if ((await this.hasBundleId(bundle, spec.mac.bundleId)) && (await this.hasRequiredFile(bundle, spec))) {
          return { spec, launcher: bundle, executables: [`${bundle}/Contents/MacOS/${name}`] };
        }
      }
    }
    return undefined;
  }

  async open({ spec, launcher }: InstalledDesktopApp, { args, env }: DesktopLaunch) {
    const isIsolated = args.length > 0;
    const variables = Object.entries(env).flatMap(([name, value]) =>
      value === undefined ? [] : ['--env', `${name}=${value}`]
    );
    const { code } = await this.processes.run({
      command: 'open',
      args: [...(isIsolated ? ['-n'] : []), ...variables, launcher, ...(isIsolated ? ['--args', ...args] : [])],
      timeoutMs: CommandTimeoutMs,
    });
    assertDomain(code === 0, DomainErrorCode.desktopAppFailed, `macOS could not open ${spec.label}.`);
  }

  defaultProfile({ mac }: DesktopAppSpec) {
    if (!mac.defaultProfile) return undefined;
    return `${this.home}/Library/Application Support/${mac.defaultProfile}`;
  }

  private async hasRequiredFile(bundle: string, { mac }: DesktopAppSpec) {
    if (!mac.requiredFile) return true;
    return (await this.fileSystem.entry(`${bundle}/${mac.requiredFile}`)).kind === EntryKind.file;
  }

  private async hasBundleId(bundle: string, bundleId: string) {
    const { code, stdout } = await this.processes.run({
      command: 'plutil',
      args: ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', `${bundle}/Contents/Info.plist`],
      timeoutMs: CommandTimeoutMs,
    });
    return code === 0 && stdout.trim() === bundleId;
  }
}
