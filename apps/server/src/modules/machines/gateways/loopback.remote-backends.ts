import type { RpcRequest, RpcResponse, RpcTransport } from '@favo/contracts/rpc/envelope';
import type { Machine } from '@favo/domain/machines/machine';
import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { RemoteBackends } from '@/modules/machines/gateways/remote-backends';

export class LoopbackRemoteBackends extends RemoteBackends {
  private readonly backends = new Map<string, RpcTransport>();
  private readonly installed = new Map<string, RpcTransport>();
  readonly closed: string[] = [];
  failure?: DomainErrorCode;

  connect(machineId: string, backend: RpcTransport) {
    this.backends.set(machineId, backend);
  }

  connectWhenInstalled(machineId: string, backend: RpcTransport) {
    this.installed.set(machineId, backend);
  }

  async request(machine: Machine, request: RpcRequest): Promise<RpcResponse> {
    if (this.failure) throw new DomainError(this.failure, `${machine.name}: scripted failure`);
    const backend = this.backends.get(machine.id);
    if (!backend) throw new DomainError(DomainErrorCode.machineUnreachable, `${machine.name}: no route to host`);
    return backend.send({ ...request, machineId: undefined });
  }

  close(machineId: string) {
    this.closed.push(machineId);
    const installed = this.installed.get(machineId);
    if (installed) this.backends.set(machineId, installed);
  }

  closeAll() {}
}
