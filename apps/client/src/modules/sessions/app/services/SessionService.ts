import { ownValue } from '@favo/domain/shared/own-value';
import { TerminalAction } from '@favo/domain/terminal/terminal-plan';
import type { Seat } from '@/modules/comb/app/entities/Seat';
import { ToastKind } from '@/shared/app/services/ToastService';
import { container } from '@/shared/container';
import type { ServiceCreator } from '@/shared/stores/app';

export type SessionService = {
  openSelectedSeat(): Promise<void>;
  launchSelectedSeat(): Promise<void>;
  signInSelectedSeat(): Promise<void>;
  signOutSelectedSeat(): Promise<void>;
  copySelectedPath(): Promise<void>;
  repairSelectedMachine(): Promise<void>;
};

export const createSessionService: ServiceCreator<SessionService> = (_set, get) => ({
  async openSelectedSeat() {
    const { selectedSeat, launchSelectedSeat, signInSelectedSeat } = get();
    if (!selectedSeat) return;
    if (selectedSeat.isSignedIn) await launchSelectedSeat();
    else await signInSelectedSeat();
  },
  async launchSelectedSeat() {
    const { selectedSeat, launchDirectories, refreshSeat } = get();
    if (!selectedSeat) return;
    const directory = ownValue(launchDirectories, selectedSeat.machineId);
    await _runInTerminal(selectedSeat, TerminalAction.launch, refreshSeat, directory);
  },
  async signInSelectedSeat() {
    const { selectedSeat } = get();
    if (selectedSeat) await _runInTerminal(selectedSeat, TerminalAction.login, get().refreshSeat);
  },
  async signOutSelectedSeat() {
    const { selectedSeat } = get();
    if (selectedSeat) await _runInTerminal(selectedSeat, TerminalAction.logout, get().refreshSeat);
  },
  async copySelectedPath() {
    const { selectedSeat, replaceSeat, showToast } = get();
    if (!selectedSeat) return;
    const fleetRepository = container.get('IFleetRepository');
    const clipboardGateway = container.get('IClipboardGateway');
    await fleetRepository.provisionSeat(selectedSeat);
    replaceSeat(selectedSeat.withProvisioned());
    const isCopied = await clipboardGateway.copy(selectedSeat.path);
    if (isCopied) showToast(`Copied. Paste it into T3 Code as ${selectedSeat.pathHint}.`);
    else showToast(`Could not reach the clipboard: ${selectedSeat.path}`, ToastKind.error);
  },
  async repairSelectedMachine() {
    const { selectedMachine, refreshMachine, showToast } = get();
    if (!selectedMachine?.isOnline) return;
    const fleetRepository = container.get('IFleetRepository');
    const linked = await fleetRepository.repairMachine(selectedMachine.id);
    await refreshMachine(selectedMachine.id);
    showToast(linked > 0 ? `Mended ${linked} shared links.` : 'Every wall is sound.');
  },
});

async function _runInTerminal(
  seat: Seat,
  action: TerminalAction,
  refreshSeat: (seat: Seat) => Promise<void>,
  directory?: string
) {
  const terminalRepository = container.get('ITerminalRepository');
  const terminalGateway = container.get('ITerminalGateway');
  const plan = await terminalRepository.plan(seat, action, directory);
  await terminalGateway.run(plan);
  await refreshSeat(seat);
}
