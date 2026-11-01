import type { HookView, ThreadView } from '@favo/contracts/rpc/views';
import { HookState } from '@favo/domain/hooks/provider-hook';
import { isOlderFavoError } from '@favo/domain/machines/machine';
import { ownValue } from '@favo/domain/shared/own-value';
import { compute } from '@/libs/zustand';
import type { Seat } from '@/modules/comb/app/entities/Seat';
import { container } from '@/shared/container';
import type { ServiceCreator } from '@/shared/stores/app';

const NoThreads: ThreadView[] = [];

export type ThreadService = {
  seatThreads: Record<string, ThreadView[]>;
  machineHooks: Record<string, HookView[]>;
  machinesWithoutThreads: string[];
  selectedThreads: ThreadView[];
  canKeepThreads: boolean;
  needsThreadHook: boolean;
  isThreadPickerOpen: boolean;
  highlightedThreadIndex: number;
  loadSelectedThreads(): Promise<void>;
  goBackToThread(): Promise<void>;
  installThreadHooks(): Promise<void>;
  moveThreadHighlight(delta: number): void;
  resumeHighlightedThread(): Promise<void>;
  closeThreadPicker(): void;
};

export const createThreadService: ServiceCreator<ThreadService> = (set, get) => ({
  ...compute(get, ({ seatThreads, machineHooks, machinesWithoutThreads, selectedSeat }) => {
    if (!selectedSeat) return { selectedThreads: NoThreads, canKeepThreads: false, needsThreadHook: false };
    const selectedThreads = ownValue(seatThreads, selectedSeat.key) ?? NoThreads;
    const hook = _hookOf(machineHooks, selectedSeat);
    const canKeepThreads = !machinesWithoutThreads.includes(selectedSeat.machineId);
    return {
      selectedThreads,
      canKeepThreads,
      needsThreadHook: canKeepThreads && selectedThreads.length === 0 && hook?.state === HookState.absent,
    };
  }),
  seatThreads: {},
  machineHooks: {},
  machinesWithoutThreads: [],
  isThreadPickerOpen: false,
  highlightedThreadIndex: 0,
  async loadSelectedThreads() {
    const { selectedSeat, selectedDirectory } = get();
    if (!selectedSeat) return;
    const { key, machineId } = selectedSeat;
    const threadRepository = container.get('IThreadRepository');
    try {
      const [threads, hooks] = await Promise.all([
        threadRepository.getThreads(selectedSeat, selectedDirectory),
        threadRepository.getHooks(machineId),
      ]);
      if (get().selectedDirectory !== selectedDirectory) return;
      set((state) => ({
        seatThreads: { ...state.seatThreads, [key]: threads },
        machineHooks: { ...state.machineHooks, [machineId]: hooks },
        machinesWithoutThreads: state.machinesWithoutThreads.filter((id) => id !== machineId),
      }));
    } catch (error) {
      if (!isOlderFavoError(error)) throw error;
      set((state) => ({ machinesWithoutThreads: [...new Set([...state.machinesWithoutThreads, machineId])] }));
    }
  },
  async goBackToThread() {
    const { selectedSeat, selectedThreads, resumeSeatThread, showToast } = get();
    if (!selectedSeat) return;
    const [newest] = selectedThreads;
    if (!newest) showToast('No thread to go back to yet.');
    else if (selectedThreads.length > 1) set({ isThreadPickerOpen: true, highlightedThreadIndex: 0 });
    else await resumeSeatThread(selectedSeat, newest);
  },
  async installThreadHooks() {
    const { selectedMachine, showToast } = get();
    if (!selectedMachine) return;
    const threadRepository = container.get('IThreadRepository');
    const hooks = await threadRepository.installHooks(selectedMachine.id);
    set((state) => ({ machineHooks: { ...state.machineHooks, [selectedMachine.id]: hooks } }));
    showToast(`favo remembers threads on ${selectedMachine.name} from now on.`);
  },
  moveThreadHighlight(delta) {
    const { selectedThreads, highlightedThreadIndex } = get();
    const last = selectedThreads.length - 1;
    set({ highlightedThreadIndex: Math.min(Math.max(highlightedThreadIndex + delta, 0), last) });
  },
  async resumeHighlightedThread() {
    const { selectedSeat, selectedThreads, highlightedThreadIndex, resumeSeatThread, closeThreadPicker } = get();
    const thread = selectedThreads[highlightedThreadIndex];
    closeThreadPicker();
    if (selectedSeat && thread) await resumeSeatThread(selectedSeat, thread);
  },
  closeThreadPicker() {
    set({ isThreadPickerOpen: false });
  },
});

function _hookOf(machineHooks: Record<string, HookView[]>, seat: Seat) {
  return ownValue(machineHooks, seat.machineId)?.find((hook) => hook.provider === seat.provider);
}
