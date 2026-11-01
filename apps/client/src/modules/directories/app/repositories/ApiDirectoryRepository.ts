import type { RpcClient } from '@favo/contracts/rpc/client';
import { listDirectories } from '@favo/contracts/rpc/directories/list-directories';
import type { IDirectoryRepository } from '@/modules/directories/app/repositories/IDirectoryRepository';

export class ApiDirectoryRepository implements IDirectoryRepository {
  constructor(private readonly client: RpcClient) {}

  listDirectories(machineId: string, input: string) {
    return this.client.call(listDirectories, { input }, { machineId });
  }
}
