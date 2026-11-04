import type { RpcClient } from '@favo/contracts/rpc/client';
import { listProviderVersions } from '@favo/contracts/rpc/updates/list-provider-versions';
import type { IProviderCliRepository } from '@/modules/updates/app/repositories/IProviderCliRepository';

export class ApiProviderCliRepository implements IProviderCliRepository {
  constructor(private readonly client: RpcClient) {}

  readMachine(machineId: string) {
    return this.client.call(listProviderVersions, {}, { machineId });
  }
}
