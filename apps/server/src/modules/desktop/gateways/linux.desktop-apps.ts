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
    quitTimeoutMs?: number
  ) {
    super(processes, quitTimeoutMs);
  }

  async find(spec: DesktopAppSpec) {
    const { launcher, executable } = spec.linux;
    const entry = await this.fileSystem.entry(executable);
    if (entry.kind === EntryKind.missing) return undefined;
    return { spec, launcher: executable, executables: [executable, `/usr/bin/${launcher}`, launcher] };
  }

  async open({ spec, launcher }: InstalledDesktopApp, { args, env }: DesktopLaunch) {
    const isDetached = this.processes.detach({ command: launcher, args, env });
    assertDomain(isDetached, DomainErrorCode.desktopAppFailed, `Could not start ${spec.label}.`);
  }
}
