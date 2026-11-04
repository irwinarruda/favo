import type { ProviderVersionView } from '@favo/contracts/rpc/views';
import { isOlderFavoError, isOlderVersion } from '@favo/domain/machines/machine';
import { type ProviderId, ProviderOrder, Providers } from '@favo/domain/providers/provider';
import { ownValue } from '@favo/domain/shared/own-value';
import type { UpdateRecord } from '@favo/domain/updates/update-outcome';
import { computeFrom } from '@/libs/zustand';
import type { Machine } from '@/modules/comb/app/entities/Machine';
import { MachinePresence } from '@/modules/comb/app/enums/MachinePresence';
import { ToastKind } from '@/shared/app/services/ToastService';
import { container } from '@/shared/container';
import type { ServiceCreator } from '@/shared/stores/app';

export type MachineClis = {
  versions: ProviderVersionView[];
  isReading: boolean;
  isOutdated: boolean;
  problem?: string;
};

export type ProviderCliRow = {
  key: string;
  machineName: string;
  version?: string;
  installedWith: string;
  lastUpdate?: UpdateRecord;
  isOlder: boolean;
};

export type ProviderCliGroup = { provider: ProviderId; label: string; rows: ProviderCliRow[] };

export type ProviderCliMachineLine = { id: string; name: string; label: string; isOld: boolean };

export type ProviderCliService = {
  isProviderClisOpen: boolean;
  machineClis: Record<string, MachineClis>;
  providerCliGroups: ProviderCliGroup[];
  providerCliMachineLines: ProviderCliMachineLine[];
  isProviderClisReading: boolean;
  preloadProviderClis(machineId: string): Promise<void>;
  openProviderClis(): Promise<void>;
  closeProviderClis(): void;
  refreshProviderClis(): Promise<void>;
  readMachineClis(machine: Machine): Promise<void>;
  updateProviders(machineId: string): Promise<void>;
};

export const createProviderCliService: ServiceCreator<ProviderCliService> = (set, get) => ({
  ...computeFrom(
    get,
    (state) => [state.machines, state.machineClis] as const,
    ({ machines, machineClis }) => ({
      providerCliGroups: _groupsOf(machines, machineClis),
      providerCliMachineLines: machines.map((machine) => _machineLineOf(machine, ownValue(machineClis, machine.id))),
      isProviderClisReading: Object.values(machineClis).some((clis) => clis.isReading),
    })
  ),
  isProviderClisOpen: false,
  machineClis: {},
  async preloadProviderClis(machineId) {
    const { machines, machineClis, readMachineClis } = get();
    const machine = machines.find((candidate) => candidate.id === machineId);
    if (machine && _isDue(machine, machineClis)) await readMachineClis(machine);
  },
  async openProviderClis() {
    set({ isProviderClisOpen: true });
    const { machines, machineClis, readMachineClis } = get();
    await Promise.all(machines.filter((machine) => _isDue(machine, machineClis)).map(readMachineClis));
  },
  closeProviderClis() {
    set({ isProviderClisOpen: false });
  },
  async refreshProviderClis() {
    const { machines, machineClis, readMachineClis } = get();
    const due = machines.filter((machine) => machine.canRead && !ownValue(machineClis, machine.id)?.isReading);
    await Promise.all(due.map(readMachineClis));
  },
  async readMachineClis(machine) {
    const machineId = machine.id;
    const providerCliRepository = container.get('IProviderCliRepository');
    const versions = ownValue(get().machineClis, machineId)?.versions ?? [];
    function finish(result: Omit<MachineClis, 'isReading'>) {
      set((state) => ({ machineClis: { ...state.machineClis, [machineId]: { ...result, isReading: false } } }));
    }
    set((state) => ({
      machineClis: { ...state.machineClis, [machineId]: { versions, isReading: true, isOutdated: false } },
    }));
    try {
      finish({ versions: await providerCliRepository.readMachine(machineId), isOutdated: false });
    } catch (error) {
      const problem = error instanceof Error ? error.message : String(error);
      finish({ versions, isOutdated: isOlderFavoError(error), problem });
    }
  },
  async updateProviders(machineId) {
    const { machines, refreshMachine, readMachineClis, openProviderClis, showToast } = get();
    const machine = machines.find(({ id }) => id === machineId);
    if (!machine?.isOnline) return;
    const terminalRepository = container.get('ITerminalRepository');
    const terminalGateway = container.get('ITerminalGateway');
    const code = await terminalGateway.run(await terminalRepository.planUpdate(machine.id));
    await Promise.all([refreshMachine(machine.id), readMachineClis(machine)]);
    await openProviderClis();
    if (code !== 0) showToast(`The update on ${machine.name} did not finish.`, ToastKind.error);
  },
});

function _isDue(machine: Machine, machineClis: Record<string, MachineClis>) {
  const clis = ownValue(machineClis, machine.id);
  return machine.canRead && (!clis || clis.problem !== undefined);
}

function _groupsOf(machines: Machine[], machineClis: Record<string, MachineClis>) {
  return ProviderOrder.flatMap<ProviderCliGroup>((provider) => {
    const found = machines.flatMap((machine) => {
      const view = ownValue(machineClis, machine.id)?.versions.find((candidate) => candidate.provider === provider);
      return view ? [{ machine, view }] : [];
    });
    const versions = found.flatMap(({ view }) => (view.version ? [view.version] : []));
    const rows = found.map(({ machine, view: { version, installedWith, lastUpdate } }) => ({
      key: `${machine.id}/${provider}`,
      machineName: machine.name,
      version,
      installedWith,
      lastUpdate,
      isOlder: version !== undefined && versions.some((other) => isOlderVersion(version, other)),
    }));
    return rows.length > 0 ? [{ provider, label: Providers[provider].label, rows }] : [];
  });
}

function _machineLineOf(machine: Machine, clis: MachineClis | undefined): ProviderCliMachineLine {
  const { id, name } = machine;
  if (machine.presence === MachinePresence.outdated || clis?.isOutdated) {
    return { id, name, label: 'older favo', isOld: true };
  }
  if (clis?.isReading) return { id, name, label: 'reading…', isOld: false };
  if (clis?.problem) return { id, name, label: 'could not read', isOld: true };
  if (!machine.isOnline || !clis) return { id, name, label: machine.presenceLabel, isOld: true };
  const count = clis.versions.length;
  if (count === 0) return { id, name, label: 'no provider CLI', isOld: false };
  return { id, name, label: count === 1 ? '1 CLI' : `${count} CLIs`, isOld: false };
}
