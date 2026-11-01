import { KeyHint } from '@/shared/components/KeyHint';
import { useError } from '@/shared/error/useError';
import { useApp } from '@/shared/stores/app';

export function KeyBar(props: { onHelp(): void; onQuit(): void; onOpenDesktopApp(): Promise<void> }) {
  const selectedSeat = useApp((state) => state.selectedSeat);
  const selectedDesktopApp = useApp((state) => state.selectedDesktopApp);
  const selectedMachine = useApp((state) => state.selectedMachine);
  const openSelectedSeat = useApp((state) => state.openSelectedSeat);
  const copySelectedPath = useApp((state) => state.copySelectedPath);
  const openAddAccount = useApp((state) => state.openAddAccount);
  const openAddMachine = useApp((state) => state.openAddMachine);
  const refreshMachine = useApp((state) => state.refreshMachine);
  const installSelectedMachine = useApp((state) => state.installSelectedMachine);
  const updateAllMachines = useApp((state) => state.updateAllMachines);
  const hasMachinesBehind = useApp((state) => state.hasMachinesBehind);
  const openThemePicker = useApp((state) => state.openThemePicker);
  const openDirectoryPicker = useApp((state) => state.openDirectoryPicker);
  const openUsage = useApp((state) => state.openUsage);
  const error = useError();

  async function onRefreshPress() {
    if (selectedMachine) await refreshMachine(selectedMachine.id);
  }

  return (
    <box flexDirection="row" paddingX={2} flexShrink={0} height={1} overflow="hidden">
      {!!selectedSeat && (
        <KeyHint
          keys="enter"
          label={selectedSeat.isSignedIn ? 'launch' : 'sign in'}
          onPress={error.handle(openSelectedSeat)}
        />
      )}
      {!!selectedSeat && <KeyHint keys="c" label="copy path" onPress={error.handle(copySelectedPath)} />}
      {!!selectedDesktopApp && (
        <KeyHint keys="p" label={`open ${selectedDesktopApp.label}`} onPress={error.handle(props.onOpenDesktopApp)} />
      )}
      {!!selectedMachine?.canInstall && (
        <KeyHint keys="i" label={selectedMachine.installLabel} onPress={error.handle(installSelectedMachine)} />
      )}
      {hasMachinesBehind && <KeyHint keys="U" label="update all" onPress={error.handle(updateAllMachines)} />}
      <KeyHint keys="u" label="usage" onPress={error.handle(openUsage)} />
      <KeyHint keys="d" label="folder" onPress={error.handle(openDirectoryPicker)} />
      <KeyHint keys="a" label="account" onPress={openAddAccount} />
      <KeyHint keys="m" label="machine" onPress={error.handle(openAddMachine)} />
      <KeyHint keys="r" label="refresh" onPress={error.handle(onRefreshPress)} />
      <KeyHint keys="t" label="theme" onPress={error.handle(openThemePicker)} />
      <KeyHint keys="?" label="help" onPress={props.onHelp} />
      <KeyHint keys="q" label="quit" onPress={props.onQuit} />
    </box>
  );
}
