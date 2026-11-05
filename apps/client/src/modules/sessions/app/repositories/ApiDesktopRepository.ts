import type { RpcClient } from '@favo/contracts/rpc/client';
import { getAppLogin } from '@favo/contracts/rpc/desktop/get-app-login';
import { listDesktopApps } from '@favo/contracts/rpc/desktop/list-desktop-apps';
import { openDesktopApp } from '@favo/contracts/rpc/desktop/open-desktop-app';
import type { Seat } from '@/modules/comb/app/entities/Seat';
import type { IDesktopRepository } from '@/modules/sessions/app/repositories/IDesktopRepository';

export class ApiDesktopRepository implements IDesktopRepository {
  constructor(private readonly client: RpcClient) {}

  getApps(machineId: string) {
    return this.client.call(listDesktopApps, {}, { machineId });
  }

  open(seat: Seat, canClose: boolean) {
    return this.client.call(openDesktopApp, { account: seat.account, provider: seat.provider, canClose });
  }

  getLogin(seat: Seat) {
    const params = { account: seat.account, provider: seat.provider };
    return this.client.call(getAppLogin, params, { machineId: seat.machineId });
  }
}
