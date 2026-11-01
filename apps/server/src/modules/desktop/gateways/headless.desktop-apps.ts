import { DesktopApps } from '@/modules/desktop/gateways/desktop-apps';

export class HeadlessDesktopApps extends DesktopApps {
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
}
