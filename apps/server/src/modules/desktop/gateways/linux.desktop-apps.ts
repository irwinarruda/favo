import type { DesktopAppSpec, DesktopLaunch } from '@favo/domain/desktop/desktop-app';
import { assertDomain, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { EntryKind } from '@favo/domain/sharing/shared-item';
import type { InstalledDesktopApp } from '@/modules/desktop/gateways/desktop-apps';
import { UnixDesktopApps } from '@/modules/desktop/gateways/unix.desktop-apps';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';

export class LinuxDesktopApps extends UnixDesktopApps {
  constructor(
    processes: ProcessRunner,
    private readonly fileSystem: FileSystem,
    private readonly configHome: string,
    quitTimeoutMs?: number
  ) {
    super(processes, quitTimeoutMs);
  }

  async find(spec: DesktopAppSpec) {
    if (!spec.linux) return undefined;
    const { executable, processNames } = spec.linux;
    const entry = await this.fileSystem.entry(executable);
    if (entry.kind === EntryKind.missing) return undefined;
    return { spec, launcher: executable, executables: processNames };
  }

  async open({ spec, launcher }: InstalledDesktopApp, { args, env }: DesktopLaunch) {
    const pid = this.processes.detach({ command: launcher, args, env });
    assertDomain(pid !== undefined, DomainErrorCode.desktopAppFailed, `Could not start ${spec.label}.`);
  }

  defaultProfile({ linux }: DesktopAppSpec) {
    if (!linux?.defaultProfile) return undefined;
    return `${this.configHome}/${linux.defaultProfile}`;
  }
}
