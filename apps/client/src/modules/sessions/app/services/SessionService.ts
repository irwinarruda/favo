import type { DesktopAppView, ThreadView } from '@favo/contracts/rpc/views';
import { DesktopOpening } from '@favo/domain/desktop/desktop-app';
import { ownValue } from '@favo/domain/shared/own-value';
import { TerminalAction } from '@favo/domain/terminal/terminal-plan';
import { compute } from '@/libs/zustand';
import type { Seat } from '@/modules/comb/app/entities/Seat';
import { ToastKind } from '@/shared/app/services/ToastService';
import { container } from '@/shared/container';
import type { ServiceCreator } from '@/shared/stores/app';

export type SessionService = {
  desktopApps: DesktopAppView[];
  selectedDesktopApp?: DesktopAppView;
  isDesktopAppBusy: boolean;
  loadDesktopApps(): Promise<void>;
  openDesktopApp(seat: Seat, canClose?: boolean): Promise<DesktopOpening | undefined>;
  openSelectedSeat(): Promise<void>;
  launchSelectedSeat(): Promise<void>;
  resumeSeatThread(seat: Seat, thread: ThreadView): Promise<void>;
  signInSelectedSeat(): Promise<void>;
  signOutSelectedSeat(): Promise<void>;
  copySelectedPath(): Promise<void>;
  repairSelectedMachine(): Promise<void>;
  updateSelectedProviders(): Promise<void>;
};

export const createSessionService: ServiceCreator<SessionService> = (set, get) => ({
  ...compute(get, ({ desktopApps, selectedSeat, selectedMachine }) => ({
    selectedDesktopApp: selectedMachine?.isLocal
      ? desktopApps.find((app) => app.provider === selectedSeat?.provider)
      : undefined,
  })),
  desktopApps: [],
  isDesktopAppBusy: false,
  async loadDesktopApps() {
    const desktopRepository = container.get('IDesktopRepository');
    set({ desktopApps: await desktopRepository.getApps() });
  },
  async openDesktopApp(seat, canClose = false) {
    const { accounts, isDesktopAppBusy, refreshSeat, showToast } = get();
    if (isDesktopAppBusy) return undefined;
    try {
      set({ isDesktopAppBusy: true });
      const desktopRepository = container.get('IDesktopRepository');
      const { opening, label } = await desktopRepository.open(seat, canClose);
      if (opening === DesktopOpening.stillOpen) return opening;
      const account = accounts.find(({ machineId, name }) => machineId === seat.machineId && name === seat.account);
      showToast(`${label} is opening as ${account?.displayName}.`);
      await refreshSeat(seat);
      return opening;
    } finally {
      set({ isDesktopAppBusy: false });
    }
  },
  async openSelectedSeat() {
    const { selectedSeat, launchSelectedSeat, signInSelectedSeat } = get();
    if (!selectedSeat) return;
    if (selectedSeat.isSignedIn) await launchSelectedSeat();
    else await signInSelectedSeat();
  },
  async launchSelectedSeat() {
    const { selectedSeat, launchDirectories, refreshSeat, loadSelectedThreads } = get();
    if (!selectedSeat) return;
    const directory = ownValue(launchDirectories, selectedSeat.machineId);
    await _runInTerminal(selectedSeat, TerminalAction.launch, refreshSeat, directory);
    await loadSelectedThreads();
  },
  async resumeSeatThread(seat, thread) {
    const { refreshSeat, loadSelectedThreads } = get();
    await _runInTerminal(seat, TerminalAction.resume, refreshSeat, thread.directory, thread.id);
    await loadSelectedThreads();
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
  async updateSelectedProviders() {
    const { selectedMachine, refreshMachine } = get();
    if (!selectedMachine?.isOnline) return;
    const terminalRepository = container.get('ITerminalRepository');
    const terminalGateway = container.get('ITerminalGateway');
    await terminalGateway.run(await terminalRepository.planUpdate(selectedMachine.id));
    await refreshMachine(selectedMachine.id);
  },
});

async function _runInTerminal(
  seat: Seat,
  action: TerminalAction,
  refreshSeat: (seat: Seat) => Promise<void>,
  directory?: string,
  thread?: string
) {
  const terminalRepository = container.get('ITerminalRepository');
  const terminalGateway = container.get('ITerminalGateway');
  const plan = await terminalRepository.plan(seat, action, directory, thread);
  await terminalGateway.run(plan);
  await refreshSeat(seat);
}
