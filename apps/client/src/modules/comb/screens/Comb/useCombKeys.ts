import { useKeyboard } from '@opentui/react';
import { useError } from '@/shared/error/useError';
import { useApp } from '@/shared/stores/app';

type CombKeys = {
  isEnabled: boolean;
  onHelp(): void;
  onQuit(): void;
  onRemoveAccount(): void;
  onForgetMachine(): void;
  onUpdateProviderClis(): void;
  onOpenDesktopApp(): Promise<void>;
  onGoBackToThread(): Promise<void>;
};

export function useCombKeys(props: CombKeys) {
  const { isEnabled, onHelp, onQuit, onRemoveAccount, onForgetMachine, onUpdateProviderClis } = props;
  const { onOpenDesktopApp, onGoBackToThread } = props;
  const moveRow = useApp((state) => state.moveRow);
  const moveAccount = useApp((state) => state.moveAccount);
  const moveMachine = useApp((state) => state.moveMachine);
  const openSelectedSeat = useApp((state) => state.openSelectedSeat);
  const signInSelectedSeat = useApp((state) => state.signInSelectedSeat);
  const signOutSelectedSeat = useApp((state) => state.signOutSelectedSeat);
  const copySelectedPath = useApp((state) => state.copySelectedPath);
  const repairSelectedMachine = useApp((state) => state.repairSelectedMachine);
  const installSelectedMachine = useApp((state) => state.installSelectedMachine);
  const updateAllMachines = useApp((state) => state.updateAllMachines);
  const openAddAccount = useApp((state) => state.openAddAccount);
  const openRenameAccount = useApp((state) => state.openRenameAccount);
  const openAddMachine = useApp((state) => state.openAddMachine);
  const refreshMachine = useApp((state) => state.refreshMachine);
  const openThemePicker = useApp((state) => state.openThemePicker);
  const openDirectoryPicker = useApp((state) => state.openDirectoryPicker);
  const openUsage = useApp((state) => state.openUsage);
  const openProviderClis = useApp((state) => state.openProviderClis);
  const selectedMachine = useApp((state) => state.selectedMachine);
  const error = useError();

  async function onRefresh() {
    if (selectedMachine) await refreshMachine(selectedMachine.id);
  }

  useKeyboard((key) => {
    if (key.ctrl && key.name === 'c') onQuit();
    if (!isEnabled) return;
    if (key.sequence === '?') onHelp();
    else if (key.shift && key.name === 'x') onForgetMachine();
    else if (key.shift && key.name === 'r') void error.handle(repairSelectedMachine)();
    else if (key.shift && key.name === 'u') void error.handle(updateAllMachines)();
    else if (key.shift && key.name === 'p') onUpdateProviderClis();
    else if (key.shift && key.name === 'tab') moveMachine(-1);
    else if (key.name === 'q') onQuit();
    else if (key.name === 'down' || key.name === 'j') moveRow(1);
    else if (key.name === 'up' || key.name === 'k') moveRow(-1);
    else if (key.name === 'right' || key.name === 'l') moveAccount(1);
    else if (key.name === 'left' || key.name === 'h') moveAccount(-1);
    else if (key.name === 'tab') moveMachine(1);
    else if (key.name === 'return') void error.handle(openSelectedSeat)();
    else if (key.name === 'b') void error.handle(onGoBackToThread)();
    else if (key.name === 's') void error.handle(signInSelectedSeat)();
    else if (key.name === 'o') void error.handle(signOutSelectedSeat)();
    else if (key.name === 'c') void error.handle(copySelectedPath)();
    else if (key.name === 'p') void error.handle(onOpenDesktopApp)();
    else if (key.name === 'i') void error.handle(installSelectedMachine)();
    else if (key.name === 'a') openAddAccount();
    else if (key.name === 'n') openRenameAccount();
    else if (key.name === 'm') void error.handle(openAddMachine)();
    else if (key.name === 'r') void error.handle(onRefresh)();
    else if (key.name === 't') void error.handle(openThemePicker)();
    else if (key.name === 'd') void error.handle(openDirectoryPicker)();
    else if (key.name === 'u') void error.handle(openUsage)();
    else if (key.name === 'v') void error.handle(openProviderClis)();
    else if (key.name === 'x') onRemoveAccount();
  });
}
