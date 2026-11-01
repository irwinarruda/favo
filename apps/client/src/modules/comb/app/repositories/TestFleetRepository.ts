import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { mockDb } from '@/__tests__/db';
import { Account } from '@/modules/comb/app/entities/Account';
import { Machine } from '@/modules/comb/app/entities/Machine';
import type { Seat } from '@/modules/comb/app/entities/Seat';
import type { IFleetRepository } from '@/modules/comb/app/repositories/IFleetRepository';

export class TestFleetRepository implements IFleetRepository {
  async getMachines() {
    return mockDb.machines.map((machine) => Machine.fromJSON(machine));
  }

  async getMachineStatus(machine: Machine) {
    return mockDb.machineStatuses[machine.id] ?? { state: 'offline' as const };
  }

  async getAccounts(machine: Machine) {
    const accounts = mockDb.accounts[machine.id] ?? [];
    return accounts.map((account) => Account.fromJSON(machine.id, account));
  }

  async getSeatStatus(seat: Seat) {
    return mockDb.seatStatuses[seat.key] ?? { login: 'signedOut' as const, problems: 0 };
  }

  async inspectSeat() {
    return mockDb.inspection;
  }

  async provisionSeat(seat: Seat) {
    mockDb.provisioned.push(seat.key);
  }

  async repairMachine(machineId: string) {
    mockDb.repaired.push(machineId);
    return mockDb.repairedLinks;
  }

  async createAccount(machineId: string, name: string) {
    const accounts = mockDb.accounts[machineId] ?? [];
    if (accounts.some((account) => account.name === name)) {
      throw new DomainError(DomainErrorCode.accountExists, `"${name}" already exists.`);
    }
    const [template] = accounts;
    const seats = (template?.seats ?? []).map((seat) => ({ ...seat, account: name, isProvisioned: false }));
    accounts.push({ name, displayName: name, isPersonal: false, seats });
    mockDb.accounts[machineId] = accounts;
  }

  async renameAccount(account: Account, newName: string) {
    const accounts = mockDb.accounts[account.machineId] ?? [];
    if (accounts.some((candidate) => candidate.displayName === newName && candidate.name !== account.name)) {
      throw new DomainError(DomainErrorCode.accountExists, `"${newName}" already exists.`);
    }
    mockDb.accounts[account.machineId] = accounts.map((candidate) =>
      candidate.name === account.name ? { ...candidate, displayName: newName } : candidate
    );
  }

  async removeAccount(account: Account) {
    const accounts = mockDb.accounts[account.machineId] ?? [];
    mockDb.accounts[account.machineId] = accounts.filter((candidate) => candidate.name !== account.name);
    return `/trash/${account.name}`;
  }
}
