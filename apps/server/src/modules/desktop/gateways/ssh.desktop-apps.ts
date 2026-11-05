import type { DesktopAppSpec } from '@favo/domain/desktop/desktop-app';
import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { DesktopApps, type InstalledDesktopApp } from '@/modules/desktop/gateways/desktop-apps';

export class SshDesktopApps extends DesktopApps {
  readonly canOpen = false;

  constructor(private readonly installed: DesktopApps) {
    super();
  }

  find(spec: DesktopAppSpec) {
    return this.installed.find(spec);
  }

  defaultProfile(spec: DesktopAppSpec) {
    return this.installed.defaultProfile(spec);
  }

  async isRunning(app: InstalledDesktopApp) {
    return refuse(app);
  }

  async quit(app: InstalledDesktopApp) {
    return refuse(app);
  }

  async open(app: InstalledDesktopApp) {
    return refuse(app);
  }
}

function refuse({ spec }: InstalledDesktopApp): never {
  throw new DomainError(DomainErrorCode.desktopAppFailed, `favo cannot reach the screen of ${spec.label} over SSH.`);
}
