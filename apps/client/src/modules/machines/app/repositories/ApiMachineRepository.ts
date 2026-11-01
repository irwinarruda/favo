import type { RpcClient } from '@favo/contracts/rpc/client';
import { addMachine } from '@favo/contracts/rpc/machines/add-machine';
import { discoverMachines } from '@favo/contracts/rpc/machines/discover-machines';
import { installMachine } from '@favo/contracts/rpc/machines/install-machine';
import { removeMachine } from '@favo/contracts/rpc/machines/remove-machine';
import type { IMachineRepository } from '@/modules/machines/app/repositories/IMachineRepository';

export class ApiMachineRepository implements IMachineRepository {
  constructor(private readonly client: RpcClient) {}

  discover() {
    return this.client.call(discoverMachines, {});
  }

  add(target: string) {
    return this.client.call(addMachine, { target });
  }

  async remove(id: string) {
    await this.client.call(removeMachine, { id });
  }

  async install(id: string) {
    const { version } = await this.client.call(installMachine, { id });
    return version;
  }
}
