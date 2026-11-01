import type { RpcRequest, RpcResponse } from '@favo/contracts/rpc/envelope';
import type { Machine } from '@favo/domain/machines/machine';

export abstract class RemoteBackends {
  abstract request(machine: Machine, request: RpcRequest): Promise<RpcResponse>;
  abstract close(machineId: string): void;
  abstract closeAll(): void;
}
