import type { SeatInspection } from '@favo/contracts/rpc/views';
import { compute } from '@/libs/zustand';
import type { Account } from '@/modules/comb/app/entities/Account';
import type { Machine } from '@/modules/comb/app/entities/Machine';
import type { Seat } from '@/modules/comb/app/entities/Seat';
import type { CombRow } from '@/modules/comb/app/services/FleetService';
import { container } from '@/shared/container';
import type { ServiceCreator } from '@/shared/stores/app';

export type SelectionService = {
  selectedRowKey?: string;
  selectedRow?: CombRow;
  selectedSeat?: Seat;
  selectedMachine?: Machine;
  selectedAccount?: Account;
  inspection?: SeatInspection;
  selectRow(key: string): void;
  moveRow(delta: number): void;
  moveAccount(delta: number): void;
  moveMachine(delta: number): void;
  inspectSelectedSeat(): Promise<void>;
};

export const createSelectionService: ServiceCreator<SelectionService> = (set, get) => ({
  ...compute(get, (state) => {
    const { combRows, selectedRowKey, machines, accounts } = state;
    const selectedRow = combRows.find((row) => row.key === selectedRowKey) ?? combRows[0];
    const selectedSeat = selectedRow?.seat;
    return {
      selectedRow,
      selectedSeat,
      selectedMachine: machines.find((machine) => machine.id === selectedRow?.machineId),
      selectedAccount: accounts.find(
        (account) => account.machineId === selectedSeat?.machineId && account.name === selectedSeat.account
      ),
    };
  }),
  selectedRowKey: undefined,
  inspection: undefined,
  selectRow(key) {
    set({ selectedRowKey: key, inspection: undefined });
  },
  moveRow(delta) {
    const { combRows, selectedRow, selectRow } = get();
    const index = combRows.findIndex((row) => row.key === selectedRow?.key);
    const next = combRows[Math.min(Math.max(index + delta, 0), combRows.length - 1)];
    if (next) selectRow(next.key);
  },
  moveAccount(delta) {
    const { combRows, selectedSeat, selectRow, accounts } = get();
    if (!selectedSeat) return;
    const siblings = accounts.filter((account) => account.machineId === selectedSeat.machineId);
    const index = siblings.findIndex((account) => account.name === selectedSeat.account);
    const target = siblings[index + delta];
    if (!target) return;
    const provider = target.visibleSeats.find((seat) => seat.provider === selectedSeat.provider);
    const row = combRows.find((candidate) => candidate.key === (provider ?? target.visibleSeats[0])?.key);
    if (row) selectRow(row.key);
  },
  moveMachine(delta) {
    const { combRows, selectedRow, machines, selectRow } = get();
    const index = machines.findIndex((machine) => machine.id === selectedRow?.machineId);
    const count = machines.length;
    if (count === 0) return;
    const machine = machines[(index + delta + count) % count];
    const row = combRows.find((candidate) => candidate.machineId === machine?.id);
    if (row) selectRow(row.key);
  },
  async inspectSelectedSeat() {
    const { selectedSeat } = get();
    if (!selectedSeat) return;
    const fleetRepository = container.get('IFleetRepository');
    const inspection = await fleetRepository.inspectSeat(selectedSeat);
    if (get().selectedSeat?.key === selectedSeat.key) set({ inspection });
  },
});
