import type { RpcClient } from '@favo/contracts/rpc/client';
import { readUsage } from '@favo/contracts/rpc/seats/read-usage';
import type { IUsageRepository } from '@/modules/usage/app/repositories/IUsageRepository';

export class ApiUsageRepository implements IUsageRepository {
  constructor(private readonly client: RpcClient) {}

  readMachine(machineId: string) {
    return this.client.call(readUsage, {}, { machineId });
  }
}
