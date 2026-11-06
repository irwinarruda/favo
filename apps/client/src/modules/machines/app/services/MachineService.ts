import type { DiscoveredMachine } from '@favo/contracts/rpc/machines/discover-machines';
import type { Machine } from '@/modules/comb/app/entities/Machine';
import { MachinePresence } from '@/modules/comb/app/enums/MachinePresence';
import { ToastKind } from '@/shared/app/services/ToastService';
import { container } from '@/shared/container';
import type { AppService, ServiceCreator } from '@/shared/stores/app';

export type MachineService = {
  isAddMachineOpen: boolean;
  isJoiningMachine: boolean;
  discoveredMachines: DiscoveredMachine[];
  addMachineError?: string;
  openAddMachine(): Promise<void>;
  closeAddMachine(): void;
  submitAddMachine(target: string): Promise<void>;
  installSelectedMachine(): Promise<void>;
  updateAllMachines(): Promise<void>;
  forgetSelectedMachine(): Promise<void>;
};

export const createMachineService: ServiceCreator<MachineService> = (set, get) => ({
  isAddMachineOpen: false,
  isJoiningMachine: false,
  discoveredMachines: [],
  addMachineError: undefined,
  async openAddMachine() {
    set({ isAddMachineOpen: true, addMachineError: undefined, discoveredMachines: [] });
    const machineRepository = container.get('IMachineRepository');
    set({ discoveredMachines: await machineRepository.discover() });
  },
  closeAddMachine() {
    set({ isAddMachineOpen: false, addMachineError: undefined });
  },
  async submitAddMachine(target) {
    try {
      const { loadFleet, closeAddMachine, showToast } = get();
      set({ isJoiningMachine: true, addMachineError: undefined });
      const machineRepository = container.get('IMachineRepository');
      const machine = await machineRepository.add(target);
      await machineRepository.install(machine.id);
      await loadFleet();
      closeAddMachine();
      showToast(`${machine.name} joined the comb.`);
    } catch (error) {
      set({ addMachineError: _messageOf(error) });
    } finally {
      set({ isJoiningMachine: false });
    }
  },
  async installSelectedMachine() {
    const { selectedMachine, showToast } = get();
    if (!selectedMachine?.canInstall) return;
    try {
      const version = await _installMachine(get, selectedMachine);
      showToast(`favo ${version} is running on ${selectedMachine.name}.`);
    } catch (error) {
      showToast(_messageOf(error), ToastKind.error);
    }
  },
  async updateAllMachines() {
    const { machines, showToast } = get();
    const behind = machines.filter((machine) => machine.canUpdate);
    if (behind.length === 0) return;
    const results = await Promise.allSettled(behind.map((machine) => _installMachine(get, machine)));
    const failure = results.find((result) => result.status === 'rejected');
    const installed = results.flatMap((result, index) =>
      result.status === 'fulfilled' ? [{ version: result.value, name: behind[index]!.name }] : []
    );
    if (failure) showToast(_messageOf(failure.reason), ToastKind.error);
    else showToast(`favo ${installed[0]!.version} is running on ${installed.map(({ name }) => name).join(', ')}.`);
  },
  async forgetSelectedMachine() {
    const { selectedMachine, loadFleet, showToast } = get();
    if (!selectedMachine || selectedMachine.isLocal) return;
    const machineRepository = container.get('IMachineRepository');
    await machineRepository.remove(selectedMachine.id);
    await loadFleet();
    showToast(`Forgot ${selectedMachine.name}. favo stays installed there.`);
  },
});

async function _installMachine(get: () => AppService, machine: Machine) {
  const { setMachinePresence, refreshMachine } = get();
  try {
    setMachinePresence(machine.id, MachinePresence.installing);
    const machineRepository = container.get('IMachineRepository');
    return await machineRepository.install(machine.id);
  } finally {
    await refreshMachine(machine.id);
  }
}

function _messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
