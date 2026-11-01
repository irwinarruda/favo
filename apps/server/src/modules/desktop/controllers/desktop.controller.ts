import { listDesktopApps } from '@favo/contracts/rpc/desktop/list-desktop-apps';
import { openDesktopApp } from '@favo/contracts/rpc/desktop/open-desktop-app';
import type { DesktopAppsService } from '@/modules/desktop/services/desktop-apps.service';
import type { RpcRouter } from '@/shared/rpc/rpc-router';

export function registerDesktopController(router: RpcRouter, desktopApps: DesktopAppsService) {
  router.handle(listDesktopApps, () => desktopApps.list());
  router.handle(openDesktopApp, (params) => desktopApps.open(params));
}
