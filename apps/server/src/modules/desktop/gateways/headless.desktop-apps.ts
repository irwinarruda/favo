import { DesktopApps } from '@/modules/desktop/gateways/desktop-apps';

export class HeadlessDesktopApps extends DesktopApps {
  readonly canOpen = false;

  async find() {
    return undefined;
  }

  async isRunning() {
    return false;
  }

  async quit() {
    return true;
  }

  async open() {}

  defaultProfile() {
    return undefined;
  }
}
