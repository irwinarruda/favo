import { DesktopOpening } from '@favo/domain/desktop/desktop-app';
import type { ScrollBoxRenderable } from '@opentui/core';
import { useTerminalDimensions } from '@opentui/react';
import { useEffect, useRef, useState } from 'react';
import { AddAccount } from '@/modules/accounts/screens/AddAccount';
import { RenameAccount } from '@/modules/accounts/screens/RenameAccount';
import { Header } from '@/modules/comb/screens/Comb/Header';
import { HelpDialog } from '@/modules/comb/screens/Comb/HelpDialog';
import { KeyBar } from '@/modules/comb/screens/Comb/KeyBar';
import { MachineCard } from '@/modules/comb/screens/Comb/MachineCard';
import { SeatDetail } from '@/modules/comb/screens/Comb/SeatDetail';
import { ToastLine } from '@/modules/comb/screens/Comb/ToastLine';
import { useCombKeys } from '@/modules/comb/screens/Comb/useCombKeys';
import { DirectoryPicker } from '@/modules/directories/screens/DirectoryPicker';
import { AddMachine } from '@/modules/machines/screens/AddMachine';
import { ThemePicker } from '@/modules/themes/screens/ThemePicker';
import { type Confirmation, ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { useError } from '@/shared/error/useError';
import { useApp } from '@/shared/stores/app';

const WideWidth = 100;
const DetailWidth = 44;
const TallHeight = 30;
const MinimumListHeight = 6;

export function Comb({ onQuit }: { onQuit(): void }) {
  const colors = useApp((state) => state.colors);
  const { width, height } = useTerminalDimensions();
  const machines = useApp((state) => state.machines);
  const loadFleet = useApp((state) => state.loadFleet);
  const selectedRow = useApp((state) => state.selectedRow);
  const selectedAccount = useApp((state) => state.selectedAccount);
  const selectedMachine = useApp((state) => state.selectedMachine);
  const removeSelectedAccount = useApp((state) => state.removeSelectedAccount);
  const forgetSelectedMachine = useApp((state) => state.forgetSelectedMachine);
  const selectedSeat = useApp((state) => state.selectedSeat);
  const selectedDesktopApp = useApp((state) => state.selectedDesktopApp);
  const isDesktopAppBusy = useApp((state) => state.isDesktopAppBusy);
  const openDesktopApp = useApp((state) => state.openDesktopApp);
  const isAddAccountOpen = useApp((state) => state.isAddAccountOpen);
  const isRenameAccountOpen = useApp((state) => state.isRenameAccountOpen);
  const isAddMachineOpen = useApp((state) => state.isAddMachineOpen);
  const isThemePickerOpen = useApp((state) => state.isThemePickerOpen);
  const isDirectoryPickerOpen = useApp((state) => state.isDirectoryPickerOpen);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const error = useError();
  const isWide = width >= WideWidth;
  const isCompact = !isWide || height < TallHeight;
  const isDialogOpen =
    isHelpOpen ||
    isAddAccountOpen ||
    isRenameAccountOpen ||
    isAddMachineOpen ||
    isThemePickerOpen ||
    isDirectoryPickerOpen ||
    confirmation !== undefined;

  function onRemoveAccount() {
    if (!selectedAccount) return;
    if (selectedAccount.isPersonal) {
      void error.handle(removeSelectedAccount)();
      return;
    }
    setConfirmation({
      title: 'delete cell',
      message: `Move ${selectedAccount.displayName} on ${selectedMachine?.name} to the trash? Its logins and threads go with it.`,
      onAccept: () => void error.handle(removeSelectedAccount)(),
    });
  }

  function onForgetMachine() {
    if (!selectedMachine || selectedMachine.isLocal) return;
    setConfirmation({
      title: 'forget machine',
      message: `Forget ${selectedMachine.name}? favo stays installed there.`,
      onAccept: () => void error.handle(forgetSelectedMachine)(),
    });
  }

  async function onOpenDesktopApp() {
    if (!selectedSeat || !selectedDesktopApp) return;
    const seat = selectedSeat;
    const { label } = selectedDesktopApp;
    const displayName = selectedAccount?.displayName;
    const opening = await openDesktopApp(seat);
    if (opening !== DesktopOpening.stillOpen) return;
    async function onCloseAndReopen() {
      await openDesktopApp(seat, true);
    }
    setConfirmation({
      title: `close ${label}`,
      message: `${label} is open. Close it and reopen as ${displayName}? Anything running in it stops.`,
      onAccept: () => void error.handle(onCloseAndReopen)(),
    });
  }

  useCombKeys({
    isEnabled: !isDialogOpen && !isDesktopAppBusy,
    onHelp: () => setIsHelpOpen(true),
    onQuit,
    onRemoveAccount,
    onForgetMachine,
    onOpenDesktopApp,
  });

  useEffect(() => {
    void error.handle(loadFleet)();
  }, []);

  useEffect(() => {
    if (selectedRow) scrollRef.current?.scrollChildIntoView(selectedRow.key);
  }, [selectedRow?.key]);

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={colors.background}>
      <Header />
      <box flexGrow={1} flexDirection={isWide ? 'row' : 'column'} paddingX={1} minHeight={0}>
        <scrollbox
          ref={scrollRef}
          flexGrow={1}
          flexShrink={1}
          minHeight={MinimumListHeight}
          marginRight={isWide ? 1 : 0}
        >
          {machines.map((machine) => (
            <MachineCard key={machine.id} machine={machine} />
          ))}
        </scrollbox>
        <SeatDetail width={isWide ? DetailWidth : undefined} isCompact={isCompact} onRemoveAccount={onRemoveAccount} />
      </box>
      <ToastLine />
      <KeyBar onHelp={() => setIsHelpOpen(true)} onQuit={onQuit} onOpenDesktopApp={onOpenDesktopApp} />
      {isHelpOpen && <HelpDialog onClose={() => setIsHelpOpen(false)} />}
      {isAddAccountOpen && <AddAccount />}
      {isRenameAccountOpen && <RenameAccount />}
      {isAddMachineOpen && <AddMachine />}
      {isThemePickerOpen && <ThemePicker />}
      {isDirectoryPickerOpen && <DirectoryPicker />}
      {!!confirmation && <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(undefined)} />}
    </box>
  );
}
