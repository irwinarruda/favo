import { addMachine } from '@favo/contracts/rpc/machines/add-machine';
import { discoverMachines } from '@favo/contracts/rpc/machines/discover-machines';
import { getMachineStatus } from '@favo/contracts/rpc/machines/get-machine-status';
import { installMachine } from '@favo/contracts/rpc/machines/install-machine';
import { listMachines } from '@favo/contracts/rpc/machines/list-machines';
import { removeMachine } from '@favo/contracts/rpc/machines/remove-machine';
import type { InstallerService } from '@/modules/machines/services/installer.service';
import type { MachinesService } from '@/modules/machines/services/machines.service';
import type { RpcRouter } from '@/shared/rpc/rpc-router';

export function registerMachinesController(router: RpcRouter, machines: MachinesService, installer: InstallerService) {
  router.handle(listMachines, () => machines.list());
  router.handle(addMachine, (params) => machines.add(params));
  router.handle(removeMachine, ({ id }) => machines.remove(id));
  router.handle(discoverMachines, () => machines.discover());
  router.handle(getMachineStatus, ({ id }) => machines.status(id));
  router.handle(installMachine, ({ id }) => installer.install(id));
}
