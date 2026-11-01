import type { MachineStatus } from '@favo/contracts/rpc/machines/get-machine-status';
import type { SeatInspection, SeatStatus } from '@favo/contracts/rpc/views';
import type { Account } from '@/modules/comb/app/entities/Account';
import type { Machine } from '@/modules/comb/app/entities/Machine';
import type { Seat } from '@/modules/comb/app/entities/Seat';

export type IFleetRepository = {
  getMachines(): Promise<Machine[]>;
  getMachineStatus(machine: Machine): Promise<MachineStatus>;
  getAccounts(machine: Machine): Promise<Account[]>;
  getSeatStatus(seat: Seat): Promise<SeatStatus>;
  inspectSeat(seat: Seat): Promise<SeatInspection>;
  provisionSeat(seat: Seat): Promise<void>;
  repairMachine(machineId: string): Promise<number>;
  createAccount(machineId: string, name: string): Promise<void>;
  renameAccount(account: Account, newName: string): Promise<void>;
  removeAccount(account: Account): Promise<string>;
};
