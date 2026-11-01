import type { OpenedDesktopApp } from '@favo/contracts/rpc/desktop/open-desktop-app';
import type { DesktopAppView } from '@favo/contracts/rpc/views';
import type { Seat } from '@/modules/comb/app/entities/Seat';

export type IDesktopRepository = {
  getApps(): Promise<DesktopAppView[]>;
  open(seat: Seat, shouldClose: boolean): Promise<OpenedDesktopApp>;
};
