import type { RpcClient } from '@favo/contracts/rpc/client';
import { listProviderVersions } from '@favo/contracts/rpc/updates/list-provider-versions';
import {
  type StartProviderUpdatesParams,
  startProviderUpdates,
} from '@favo/contracts/rpc/updates/start-provider-updates';
import type { IProviderCliRepository } from '@/modules/updates/app/repositories/IProviderCliRepository';

export class ApiProviderCliRepository implements IProviderCliRepository {
  constructor(private readonly client: RpcClient) {}

  readMachine(machineId: string) {
    return this.client.call(listProviderVersions, {}, { machineId });
  }

  async startUpdates(machineId: string, request: StartProviderUpdatesParams) {
    const { started } = await this.client.call(startProviderUpdates, request, { machineId });
    return started;
  }
}
