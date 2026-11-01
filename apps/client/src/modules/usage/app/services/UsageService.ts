import type { SeatUsageView } from '@favo/contracts/rpc/views';
import { isOlderFavoError } from '@favo/domain/machines/machine';
import { ownValue } from '@favo/domain/shared/own-value';
import {
  keepLastGoodUsage,
  readingAgeOf,
  UsageFreshForMs,
  UsageUnavailableReason,
  unavailableUsage,
} from '@favo/domain/usage/seat-usage';
import { collectUsagePools, type UsagePool } from '@favo/domain/usage/usage-pool';
import { computeFrom } from '@/libs/zustand';
import type { Machine } from '@/modules/comb/app/entities/Machine';
import { MachinePresence } from '@/modules/comb/app/enums/MachinePresence';
import { container } from '@/shared/container';
import type { ServiceCreator } from '@/shared/stores/app';

export type MachineUsage = {
  seats: SeatUsageView[];
  readAt: number;
  isReading: boolean;
  isOutdated: boolean;
  problem?: string;
};

export type UsageMachineLine = { id: string; name: string; label: string; isOld: boolean };

export type UsageService = {
  isUsageOpen: boolean;
  usageNow: number;
  machineUsage: Record<string, MachineUsage>;
  usagePools: UsagePool[];
  usageMachineLines: UsageMachineLine[];
  isUsageReading: boolean;
  openUsage(): Promise<void>;
  closeUsage(): void;
  refreshUsage(): Promise<void>;
  tickUsage(): void;
  readMachineUsage(machine: Machine): Promise<void>;
};

export const createUsageService: ServiceCreator<UsageService> = (set, get) => ({
  ...computeFrom(
    get,
    (state) => [state.machines, state.machineUsage, state.usageNow] as const,
    ({ machines, machineUsage, usageNow }) => ({
      usagePools: collectUsagePools(_seatsOf(machines, machineUsage), usageNow),
      usageMachineLines: machines.map((machine) =>
        _machineLineOf(machine, ownValue(machineUsage, machine.id), usageNow)
      ),
      isUsageReading: Object.values(machineUsage).some((usage) => usage.isReading),
    })
  ),
  isUsageOpen: false,
  usageNow: 0,
  machineUsage: {},
  async openUsage() {
    const now = Date.now();
    set({ isUsageOpen: true, usageNow: now });
    const { machines, machineUsage, readMachineUsage } = get();
    const due = machines.filter((machine) => {
      const usage = ownValue(machineUsage, machine.id);
      return _canRead(machine) && (!usage || now - usage.readAt >= UsageFreshForMs);
    });
    await Promise.all(due.map(readMachineUsage));
  },
  closeUsage() {
    set({ isUsageOpen: false });
  },
  async refreshUsage() {
    const { machines, machineUsage, readMachineUsage } = get();
    const due = machines.filter((machine) => _canRead(machine) && !ownValue(machineUsage, machine.id)?.isReading);
    await Promise.all(due.map(readMachineUsage));
  },
  tickUsage() {
    set({ usageNow: Date.now() });
  },
  async readMachineUsage(machine) {
    const machineId = machine.id;
    const usageRepository = container.get('IUsageRepository');
    const seats = ownValue(get().machineUsage, machineId)?.seats ?? [];
    const reading = { seats, readAt: Date.now(), isOutdated: false, problem: undefined };
    function finish(result: Partial<MachineUsage>) {
      const usageNow = Date.now();
      const usage = { ...reading, ...result, isReading: false };
      set((state) => ({ usageNow, machineUsage: { ...state.machineUsage, [machineId]: usage } }));
    }
    set((state) => ({ machineUsage: { ...state.machineUsage, [machineId]: { ...reading, isReading: true } } }));
    try {
      finish({ seats: _withLastGood(seats, await usageRepository.readMachine(machineId)) });
    } catch (error) {
      const problem = error instanceof Error ? error.message : String(error);
      finish({ seats: _withFailure(seats, problem), isOutdated: isOlderFavoError(error), problem });
    }
  },
});

function _canRead(machine: Machine) {
  return machine.isOnline || machine.presence === MachinePresence.connecting;
}

function _sameSeat(left: SeatUsageView, right: SeatUsageView) {
  return left.account === right.account && left.provider === right.provider;
}

function _withLastGood(previous: SeatUsageView[], next: SeatUsageView[]) {
  return next.map((seat) => {
    const usage = previous.find((candidate) => _sameSeat(candidate, seat))?.usage;
    return { ...seat, usage: keepLastGoodUsage(usage, seat.usage) };
  });
}

function _withFailure(previous: SeatUsageView[], message: string) {
  const failure = unavailableUsage(new Date().toISOString(), UsageUnavailableReason.probeFailed, message);
  return previous
    .filter((seat) => seat.usage.windows.length > 0)
    .map((seat) => ({ ...seat, usage: keepLastGoodUsage(seat.usage, failure) }));
}

function _seatsOf(machines: Machine[], machineUsage: Record<string, MachineUsage>) {
  return machines.flatMap((machine) =>
    (ownValue(machineUsage, machine.id)?.seats ?? []).map((seat) => ({
      ...seat,
      key: `${machine.id}/${seat.account}/${seat.provider}`,
      machineName: machine.name,
    }))
  );
}

function _machineLineOf(machine: Machine, usage: MachineUsage | undefined, now: number): UsageMachineLine {
  const { id, name } = machine;
  if (machine.presence === MachinePresence.outdated || usage?.isOutdated) {
    return { id, name, label: 'older favo', isOld: true };
  }
  if (usage?.isReading) return { id, name, label: 'reading…', isOld: false };
  if (usage?.problem) return { id, name, label: 'could not read', isOld: true };
  if (!machine.isOnline || !usage) return { id, name, label: machine.presenceLabel, isOld: true };
  const newest = usage.seats
    .map((seat) => seat.usage.checkedAt)
    .toSorted()
    .at(-1);
  if (!newest) return { id, name, label: 'no seats signed in', isOld: false };
  return { id, name, label: readingAgeOf(newest, now), isOld: now - Date.parse(newest) >= UsageFreshForMs };
}
