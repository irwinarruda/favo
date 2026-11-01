import { computeFrom } from '@/libs/zustand';
import type { Account } from '@/modules/comb/app/entities/Account';
import type { Machine } from '@/modules/comb/app/entities/Machine';
import type { Seat } from '@/modules/comb/app/entities/Seat';
import { MachinePresence } from '@/modules/comb/app/enums/MachinePresence';
import { container } from '@/shared/container';
import type { ServiceCreator } from '@/shared/stores/app';

export type CombRow = { key: string; machineId: string; seat?: Seat };
export type FleetSummary = { machines: number; accounts: number; signedIn: number };

export type FleetService = {
  machines: Machine[];
  accounts: Account[];
  isFleetLoading: boolean;
  combRows: CombRow[];
  fleetSummary: FleetSummary;
  hasMachinesBehind: boolean;
  loadFleet(): Promise<void>;
  refreshMachine(machineId: string): Promise<void>;
  loadMachine(machine: Machine): Promise<void>;
  refreshSeat(seat: Seat): Promise<void>;
  replaceSeat(seat: Seat): void;
  setMachinePresence(machineId: string, presence: MachinePresence, message?: string): void;
};

export const createFleetService: ServiceCreator<FleetService> = (set, get) => ({
  ...computeFrom(
    get,
    (state) => [state.machines, state.accounts] as const,
    (state) => ({
      combRows: _rowsOf(state.machines, state.accounts),
      fleetSummary: _summaryOf(state.machines, state.accounts),
      hasMachinesBehind: state.machines.some((machine) => machine.canUpdate),
    })
  ),
  machines: [],
  accounts: [],
  isFleetLoading: false,
  async loadFleet() {
    try {
      set({ isFleetLoading: true });
      const fleetRepository = container.get('IFleetRepository');
      const machines = await fleetRepository.getMachines();
      set({ machines });
      await Promise.all(
        machines.map(async (machine) => {
          await get().refreshMachine(machine.id);
          void get().preloadUsage(machine.id);
        })
      );
    } finally {
      set({ isFleetLoading: false });
    }
  },
  async refreshMachine(machineId) {
    const { machines, loadMachine, loadDesktopApps } = get();
    const machine = machines.find((candidate) => candidate.id === machineId);
    if (!machine) return;
    await Promise.all([loadMachine(machine), machine.isLocal ? loadDesktopApps() : undefined]);
  },
  async loadMachine(machine) {
    const { setMachinePresence } = get();
    const machineId = machine.id;
    setMachinePresence(machineId, MachinePresence.connecting);
    const fleetRepository = container.get('IFleetRepository');
    const status = await fleetRepository.getMachineStatus(machine);
    const refreshed = machine.withStatus(status);
    set((state) => ({ machines: state.machines.map((item) => (item.id === machineId ? refreshed : item)) }));
    const accounts = refreshed.isOnline ? await fleetRepository.getAccounts(refreshed) : [];
    set((state) => ({ accounts: _mergeAccounts(state.machines, state.accounts, machineId, accounts) }));
    const seats = accounts.flatMap((account) => account.visibleSeats);
    await Promise.all(seats.map((seat) => get().refreshSeat(seat)));
  },
  async refreshSeat(seat) {
    const fleetRepository = container.get('IFleetRepository');
    const status = await fleetRepository.getSeatStatus(seat);
    get().replaceSeat(seat.withStatus(status));
  },
  replaceSeat(seat) {
    set((state) => ({ accounts: state.accounts.map((account) => account.withSeat(seat)) }));
  },
  setMachinePresence(machineId, presence, message) {
    set((state) => ({
      machines: state.machines.map((machine) =>
        machine.id === machineId ? machine.withPresence(presence, message) : machine
      ),
    }));
  },
});

function _rowsOf(machines: Machine[], accounts: Account[]) {
  return machines.flatMap<CombRow>((machine) => {
    const seats = accounts
      .filter((account) => account.machineId === machine.id)
      .flatMap((account) => account.visibleSeats);
    if (seats.length === 0) return [{ key: `machine:${machine.id}`, machineId: machine.id }];
    return seats.map((seat) => ({ key: seat.key, machineId: machine.id, seat }));
  });
}

function _summaryOf(machines: Machine[], accounts: Account[]): FleetSummary {
  const signedIn = accounts.reduce((total, account) => total + account.signedInCount, 0);
  return { machines: machines.length, accounts: accounts.length, signedIn };
}

function _mergeAccounts(machines: Machine[], current: Account[], machineId: string, next: Account[]) {
  const others = current.filter((account) => account.machineId !== machineId);
  const order = machines.map((machine) => machine.id);
  return [...others, ...next].toSorted((left, right) => order.indexOf(left.machineId) - order.indexOf(right.machineId));
}
