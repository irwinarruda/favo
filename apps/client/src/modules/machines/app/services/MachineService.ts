import type { DiscoveredMachine } from '@favo/contracts/rpc/machines/discover-machines';
import { MachinePresence } from '@/modules/comb/app/enums/MachinePresence';
import { ToastKind } from '@/shared/app/services/ToastService';
import { container } from '@/shared/container';
import type { ServiceCreator } from '@/shared/stores/app';

export type MachineService = {
  isAddMachineOpen: boolean;
  isJoiningMachine: boolean;
  discoveredMachines: DiscoveredMachine[];
  addMachineError?: string;
  openAddMachine(): Promise<void>;
  closeAddMachine(): void;
  submitAddMachine(target: string): Promise<void>;
  installSelectedMachine(): Promise<void>;
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
      set({ addMachineError: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ isJoiningMachine: false });
    }
  },
  async installSelectedMachine() {
    const { selectedMachine, setMachinePresence, refreshMachine, showToast } = get();
    if (!selectedMachine?.canInstall) return;
    try {
      setMachinePresence(selectedMachine.id, MachinePresence.installing);
      const machineRepository = container.get('IMachineRepository');
      const version = await machineRepository.install(selectedMachine.id);
      showToast(`favo ${version} is running on ${selectedMachine.name}.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), ToastKind.error);
    } finally {
      await refreshMachine(selectedMachine.id);
    }
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
