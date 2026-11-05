import type { DesktopOpenResult } from '@favo/contracts/rpc/desktop/open-desktop-app';
import type { AppLoginStatus, DesktopAppView } from '@favo/contracts/rpc/views';
import type { Seat } from '@/modules/comb/app/entities/Seat';

export type IDesktopRepository = {
  getApps(machineId: string): Promise<DesktopAppView[]>;
  open(seat: Seat, canClose: boolean): Promise<DesktopOpenResult>;
  getLogin(seat: Seat): Promise<AppLoginStatus>;
};
