import type { DirectoryEntry } from '@favo/contracts/rpc/directories/list-directories';
import { parentDirectoryInput } from '@favo/domain/directories/directory-input';
import { ownValue } from '@favo/domain/shared/own-value';
import { compute } from '@/libs/zustand';
import { shortPath } from '@/modules/comb/parsers/shortPath';
import { container } from '@/shared/container';
import type { ServiceCreator } from '@/shared/stores/app';

export type DirectoryService = {
  launchDirectories: Record<string, string>;
  selectedDirectory?: string;
  isDirectoryPickerOpen: boolean;
  directoryInput: string;
  directoryEntries: DirectoryEntry[];
  highlightedDirectoryIndex?: number;
  directoryError?: string;
  openDirectoryPicker(): Promise<void>;
  closeDirectoryPicker(): void;
  changeDirectoryInput(input: string): Promise<void>;
  moveDirectoryHighlight(delta: number): void;
  completeDirectory(): Promise<void>;
  goUpDirectory(): Promise<void>;
  submitDirectory(): Promise<void>;
};

export const createDirectoryService: ServiceCreator<DirectoryService> = (set, get) => {
  let latestListing = 0;

  return {
    ...compute(get, (state) => {
      const { selectedMachine, launchDirectories } = state;
      if (!selectedMachine) return { selectedDirectory: undefined };
      return { selectedDirectory: ownValue(launchDirectories, selectedMachine.id) ?? selectedMachine.directory };
    }),
    launchDirectories: {},
    isDirectoryPickerOpen: false,
    directoryInput: '',
    directoryEntries: [],
    highlightedDirectoryIndex: undefined,
    directoryError: undefined,
    async openDirectoryPicker() {
      const { selectedMachine, selectedDirectory, changeDirectoryInput } = get();
      if (!selectedMachine?.isOnline) return;
      set({ isDirectoryPickerOpen: true, directoryInput: '', directoryEntries: [], directoryError: undefined });
      await changeDirectoryInput(_startingInput(selectedDirectory));
    },
    closeDirectoryPicker() {
      latestListing++;
      set({ isDirectoryPickerOpen: false, highlightedDirectoryIndex: undefined, directoryError: undefined });
    },
    async changeDirectoryInput(input) {
      const { directoryInput, selectedMachine } = get();
      if (input === directoryInput || !selectedMachine) return;
      set({ directoryInput: input, highlightedDirectoryIndex: undefined, directoryError: undefined });
      const request = ++latestListing;
      const directoryRepository = container.get('IDirectoryRepository');
      const { entries } = await directoryRepository.listDirectories(selectedMachine.id, input);
      if (request === latestListing) set({ directoryEntries: entries });
    },
    moveDirectoryHighlight(delta) {
      const { directoryEntries, highlightedDirectoryIndex } = get();
      const count = directoryEntries.length;
      if (count === 0) return;
      if (highlightedDirectoryIndex === undefined) {
        set({ highlightedDirectoryIndex: delta > 0 ? 0 : count - 1 });
        return;
      }
      set({ highlightedDirectoryIndex: (highlightedDirectoryIndex + delta + count) % count });
    },
    async completeDirectory() {
      const { directoryEntries, highlightedDirectoryIndex, changeDirectoryInput } = get();
      const entry = directoryEntries[highlightedDirectoryIndex ?? 0];
      if (entry) await changeDirectoryInput(entry.completion);
    },
    async goUpDirectory() {
      const { directoryInput, changeDirectoryInput } = get();
      await changeDirectoryInput(parentDirectoryInput(directoryInput));
    },
    async submitDirectory() {
      const { directoryInput, highlightedDirectoryIndex, completeDirectory, selectedMachine } = get();
      if (highlightedDirectoryIndex !== undefined) {
        await completeDirectory();
        return;
      }
      if (!selectedMachine) return;
      const directoryRepository = container.get('IDirectoryRepository');
      const { directory, exists } = await directoryRepository.listDirectories(selectedMachine.id, directoryInput);
      if (!exists) {
        set({ directoryError: `No folder at ${directory}.` });
        return;
      }
      const { launchDirectories, closeDirectoryPicker, showToast } = get();
      set({ launchDirectories: { ...launchDirectories, [selectedMachine.id]: directory } });
      closeDirectoryPicker();
      showToast(`${selectedMachine.name} launches in ${shortPath(directory)}.`);
    },
  };
};

function _startingInput(directory = '~') {
  const separator = directory.includes('\\') ? '\\' : '/';
  const input = shortPath(directory);
  return input.endsWith(separator) ? input : `${input}${separator}`;
}
