import type { RpcClient } from '@favo/contracts/rpc/client';
import { installHooks } from '@favo/contracts/rpc/hooks/install-hooks';
import { listHooks } from '@favo/contracts/rpc/hooks/list-hooks';
import { listThreads } from '@favo/contracts/rpc/threads/list-threads';
import type { Seat } from '@/modules/comb/app/entities/Seat';
import type { IThreadRepository } from '@/modules/threads/app/repositories/IThreadRepository';

export class ApiThreadRepository implements IThreadRepository {
  constructor(private readonly client: RpcClient) {}

  getThreads(seat: Seat, directory?: string) {
    const params = { account: seat.account, provider: seat.provider, directory };
    return this.client.call(listThreads, params, { machineId: seat.machineId });
  }

  getHooks(machineId: string) {
    return this.client.call(listHooks, {}, { machineId });
  }

  installHooks(machineId: string) {
    return this.client.call(installHooks, {}, { machineId });
  }
}
