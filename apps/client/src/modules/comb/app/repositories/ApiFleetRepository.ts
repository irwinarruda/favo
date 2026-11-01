import { createAccount } from '@favo/contracts/rpc/accounts/create-account';
import { listAccounts } from '@favo/contracts/rpc/accounts/list-accounts';
import { removeAccount } from '@favo/contracts/rpc/accounts/remove-account';
import { renameAccount } from '@favo/contracts/rpc/accounts/rename-account';
import type { RpcClient } from '@favo/contracts/rpc/client';
import { getMachineStatus } from '@favo/contracts/rpc/machines/get-machine-status';
import { listMachines } from '@favo/contracts/rpc/machines/list-machines';
import { getSeatStatus } from '@favo/contracts/rpc/seats/get-seat-status';
import { inspectSeat } from '@favo/contracts/rpc/seats/inspect-seat';
import { provisionSeat } from '@favo/contracts/rpc/seats/provision-seat';
import { repairSeats } from '@favo/contracts/rpc/seats/repair-seats';
import { Account } from '@/modules/comb/app/entities/Account';
import { Machine } from '@/modules/comb/app/entities/Machine';
import type { Seat } from '@/modules/comb/app/entities/Seat';
import type { IFleetRepository } from '@/modules/comb/app/repositories/IFleetRepository';

export class ApiFleetRepository implements IFleetRepository {
  constructor(private readonly client: RpcClient) {}

  async getMachines() {
    const machines = await this.client.call(listMachines, {});
    return machines.map((machine) => Machine.fromJSON(machine));
  }

  async getMachineStatus(machine: Machine) {
    return this.client.call(getMachineStatus, { id: machine.id });
  }

  async getAccounts(machine: Machine) {
    const accounts = await this.client.call(listAccounts, {}, { machineId: machine.id });
    return accounts.map((account) => Account.fromJSON(machine.id, account));
  }

  async getSeatStatus(seat: Seat) {
    const params = { account: seat.account, provider: seat.provider };
    return this.client.call(getSeatStatus, params, { machineId: seat.machineId });
  }

  async inspectSeat(seat: Seat) {
    const params = { account: seat.account, provider: seat.provider };
    return this.client.call(inspectSeat, params, { machineId: seat.machineId });
  }

  async provisionSeat(seat: Seat) {
    const params = { account: seat.account, provider: seat.provider };
    await this.client.call(provisionSeat, params, { machineId: seat.machineId });
  }

  async repairMachine(machineId: string) {
    const repairs = await this.client.call(repairSeats, {}, { machineId });
    return repairs.reduce((total, repair) => total + repair.linked.length, 0);
  }

  async createAccount(machineId: string, name: string) {
    await this.client.call(createAccount, { name }, { machineId });
  }

  async renameAccount(account: Account, newName: string) {
    await this.client.call(renameAccount, { name: account.name, newName }, { machineId: account.machineId });
  }

  async removeAccount(account: Account) {
    const { trashedTo } = await this.client.call(
      removeAccount,
      { name: account.name },
      { machineId: account.machineId }
    );
    return trashedTo;
  }
}
