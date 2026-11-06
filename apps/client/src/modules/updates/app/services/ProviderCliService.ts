import type { ProviderVersionView } from '@favo/contracts/rpc/views';
import { isOlderFavoError, isOlderVersion } from '@favo/domain/machines/machine';
import { type ProviderId, ProviderOrder, Providers } from '@favo/domain/providers/provider';
import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { ownValue } from '@favo/domain/shared/own-value';
import { isLeftWhileRunning, type UpdateRecord, UpdateState } from '@favo/domain/updates/update-outcome';
import { computeFrom } from '@/libs/zustand';
import type { Machine } from '@/modules/comb/app/entities/Machine';
import { MachinePresence } from '@/modules/comb/app/enums/MachinePresence';
import { ToastKind } from '@/shared/app/services/ToastService';
import { container } from '@/shared/container';
import type { AppService, ServiceCreator } from '@/shared/stores/app';

const UpdatePollMs = 2_000;
const UpdatePolls = 450;

export type MachineClis = {
  versions: ProviderVersionView[];
  isReading: boolean;
  isOutdated: boolean;
  problem?: string;
};

export type VersionBefore = { version?: string };

export type ProviderCliRow = {
  key: string;
  machineId: string;
  machineName: string;
  provider: ProviderId;
  label: string;
  version?: string;
  installedWith: string;
  lastUpdate?: UpdateRecord;
  isOlder: boolean;
  isUpdating: boolean;
  updatedFrom?: string;
  isUnchanged: boolean;
};

export type ProviderCliGroup = { provider: ProviderId; label: string; rows: ProviderCliRow[] };

export type ProviderCliMachineLine = { id: string; name: string; label: string; isOld: boolean };

export type ProviderCliTarget = Pick<ProviderCliRow, 'machineId' | 'machineName' | 'provider' | 'label'>;

export type ProviderCliUpdate = { targets?: ProviderCliTarget[]; isRunningIncluded?: boolean };

type MachineRun = { machine: Machine; providers?: ProviderId[] };

type StartedRun = { machine: Machine; before: Record<string, VersionBefore>; problem?: string };

export type ProviderCliService = {
  isProviderClisOpen: boolean;
  machineClis: Record<string, MachineClis>;
  versionsBeforeUpdate: Record<string, VersionBefore>;
  isUpdatingProviderClis: boolean;
  isProviderCliDriftNoticed: boolean;
  providerCliGroups: ProviderCliGroup[];
  providerCliMachineLines: ProviderCliMachineLine[];
  providerClisBehind: ProviderCliRow[];
  isProviderClisReading: boolean;
  preloadProviderClis(machineId: string): Promise<void>;
  openProviderClis(): Promise<void>;
  closeProviderClis(): void;
  refreshProviderClis(): Promise<void>;
  readMachineClis(machine: Machine): Promise<void>;
  updateProviderClis(update?: ProviderCliUpdate): Promise<ProviderCliTarget[]>;
};

export const createProviderCliService: ServiceCreator<ProviderCliService> = (set, get) => ({
  ...computeFrom(
    get,
    (state) => [state.machines, state.machineClis, state.versionsBeforeUpdate] as const,
    ({ machines, machineClis, versionsBeforeUpdate }) => {
      const providerCliGroups = _groupsOf(machines, machineClis, versionsBeforeUpdate);
      return {
        providerCliGroups,
        providerCliMachineLines: machines.map((machine) => _machineLineOf(machine, ownValue(machineClis, machine.id))),
        providerClisBehind: providerCliGroups.flatMap(({ rows }) =>
          rows.filter(({ isOlder, isUpdating }) => isOlder && !isUpdating)
        ),
        isProviderClisReading: Object.values(machineClis).some((clis) => clis.isReading),
      };
    }
  ),
  isProviderClisOpen: false,
  machineClis: {},
  versionsBeforeUpdate: {},
  isUpdatingProviderClis: false,
  isProviderCliDriftNoticed: false,
  async preloadProviderClis(machineId) {
    const { machines, machineClis, readMachineClis } = get();
    const machine = machines.find((candidate) => candidate.id === machineId);
    if (!machine || !_isDue(machine, machineClis)) return;
    await readMachineClis(machine);
    const { providerClisBehind, isProviderCliDriftNoticed, isUpdatingProviderClis, showToast } = get();
    if (providerClisBehind.length > 0 && !isProviderCliDriftNoticed && !isUpdatingProviderClis) {
      set({ isProviderCliDriftNoticed: true });
      showToast(_behindNoticeOf(providerClisBehind));
    }
    if (_isUpdatingOn(get(), machineId)) await _follow(get, machine);
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
  async updateProviderClis({ targets, isRunningIncluded } = {}) {
    if (get().isUpdatingProviderClis) return [];
    try {
      set({ isUpdatingProviderClis: true, isProviderClisOpen: true });
      const { hasMachinesBehind, updateAllMachines } = get();
      if (!targets && hasMachinesBehind) await updateAllMachines();
      const runs = _runsOf(get().machines, targets);
      const started = await Promise.all(runs.map((run) => _start(run, isRunningIncluded)));
      const before = Object.fromEntries(started.flatMap((run) => Object.entries(run.before)));
      set((state) => ({ versionsBeforeUpdate: { ...state.versionsBeforeUpdate, ...before } }));
      const followed = started.filter(({ problem }) => problem === undefined);
      const lost = await Promise.all(followed.map(({ machine }) => _follow(get, machine)));
      const problems = [...started.map(({ problem }) => problem), ...lost].filter((problem) => problem !== undefined);
      const rows = get().providerCliGroups.flatMap((group) => group.rows.filter(({ key }) => key in before));
      const toast = _toastOf(problems, rows);
      if (toast) get().showToast(toast.message, toast.kind);
      return rows.filter((row) => isLeftWhileRunning(row.lastUpdate)).map(_targetOf);
    } finally {
      set({ isUpdatingProviderClis: false });
    }
  },
});

function _isDue(machine: Machine, machineClis: Record<string, MachineClis>) {
  const clis = ownValue(machineClis, machine.id);
  return machine.canRead && (!clis || clis.problem !== undefined);
}

function _groupsOf(
  machines: Machine[],
  machineClis: Record<string, MachineClis>,
  versionsBeforeUpdate: Record<string, VersionBefore>
) {
  return ProviderOrder.flatMap<ProviderCliGroup>((provider) => {
    const found = machines.flatMap((machine) => {
      const clis = ownValue(machineClis, machine.id);
      const view = clis?.versions.find((candidate) => candidate.provider === provider);
      return view ? [{ machine, view, isReadable: clis?.problem === undefined }] : [];
    });
    const versions = found.flatMap(({ view }) => (view.version ? [view.version] : []));
    const rows = found.map(({ machine, view: { label, version, installedWith, lastUpdate }, isReadable }) => {
      const key = `${machine.id}/${provider}`;
      const before = ownValue(versionsBeforeUpdate, key);
      const isSettled = before !== undefined && lastUpdate === undefined;
      return {
        key,
        machineId: machine.id,
        machineName: machine.name,
        provider,
        label,
        version,
        installedWith,
        lastUpdate,
        isOlder: version !== undefined && versions.some((other) => isOlderVersion(version, other)),
        isUpdating: lastUpdate?.state === UpdateState.updating && isReadable,
        updatedFrom: isSettled && before.version !== version ? (before.version ?? 'an unknown version') : undefined,
        isUnchanged: isSettled && before.version === version,
      };
    });
    return rows.length > 0 ? [{ provider, label: Providers[provider].label, rows }] : [];
  });
}

function _machineLineOf(machine: Machine, clis: MachineClis | undefined): ProviderCliMachineLine {
  const { id, name } = machine;
  if (machine.presence === MachinePresence.outdated || clis?.isOutdated) {
    return { id, name, label: 'older favo', isOld: true };
  }
  if (clis?.problem) return { id, name, label: 'could not read', isOld: true };
  if (clis?.versions.some(({ lastUpdate }) => lastUpdate?.state === UpdateState.updating)) {
    return { id, name, label: 'updating…', isOld: false };
  }
  if (clis?.isReading) return { id, name, label: 'reading…', isOld: false };
  if (!machine.isOnline || !clis) return { id, name, label: machine.presenceLabel, isOld: true };
  const count = clis.versions.length;
  if (count === 0) return { id, name, label: 'no provider CLI', isOld: false };
  return { id, name, label: count === 1 ? '1 CLI' : `${count} CLIs`, isOld: false };
}

function _behindNoticeOf(rows: ProviderCliRow[]) {
  const [first] = rows;
  const what = rows.length === 1 ? `${first!.label} on ${first!.machineName} is` : `${rows.length} provider CLIs are`;
  return `${what} older than on another machine. Press P to update every machine.`;
}

function _runsOf(machines: Machine[], targets?: ProviderCliTarget[]) {
  return machines.flatMap<MachineRun>((machine) => {
    const providers = targets?.filter(({ machineId }) => machineId === machine.id).map(({ provider }) => provider);
    return machine.isOnline && providers?.length !== 0 ? [{ machine, providers }] : [];
  });
}

async function _start({ machine, providers }: MachineRun, isRunningIncluded?: boolean): Promise<StartedRun> {
  try {
    const providerCliRepository = container.get('IProviderCliRepository');
    const started = await providerCliRepository.startUpdates(machine.id, { providers, isRunningIncluded });
    const before = started.map(({ provider, version }) => [`${machine.id}/${provider}`, { version }] as const);
    return { machine, before: Object.fromEntries(before) };
  } catch (error) {
    return { machine, before: {}, problem: _startProblemOf(machine, error) };
  }
}

function _startProblemOf(machine: Machine, error: unknown) {
  if (isOlderFavoError(error)) return `${machine.name} runs an older favo. Press U to update it first.`;
  if (error instanceof DomainError && error.code === DomainErrorCode.updateNotStarted) {
    return `favo could not start updating the provider CLIs on ${machine.name}.`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function _follow(get: () => AppService, machine: Machine) {
  await get().readMachineClis(machine);
  for (let poll = 0; poll < UpdatePolls && _isUpdatingOn(get(), machine.id); poll++) {
    await _wait(UpdatePollMs);
    await get().readMachineClis(machine);
  }
  return ownValue(get().machineClis, machine.id)?.problem;
}

function _isUpdatingOn({ machineClis }: AppService, machineId: string) {
  const clis = ownValue(machineClis, machineId);
  if (!clis || clis.problem !== undefined) return false;
  return clis.versions.some(({ lastUpdate }) => lastUpdate?.state === UpdateState.updating);
}

function _toastOf(problems: string[], rows: ProviderCliRow[]) {
  const summary = _summaryOf(rows);
  if (problems.length === 0) return summary;
  const sentences = problems.map((problem) => (problem.endsWith('.') ? problem : `${problem}.`));
  const message = [...sentences, ...(summary ? [summary.message] : [])].join(' ');
  return { message, kind: ToastKind.error };
}

function _summaryOf(rows: ProviderCliRow[]) {
  const failed = rows.filter(
    ({ lastUpdate }) => lastUpdate?.state === UpdateState.failed || lastUpdate?.state === UpdateState.stopped
  );
  const still = rows.filter(({ lastUpdate }) => lastUpdate?.state === UpdateState.updating);
  const updated = rows.filter(({ updatedFrom }) => updatedFrom !== undefined);
  if (failed.length > 0) {
    const message = `${_countOf(failed.length, 'provider CLI')} did not update. Run favo update --providers to see why.`;
    return { message, kind: ToastKind.error };
  }
  if (still.length > 0) {
    const verb = still.length === 1 ? 'is' : 'are';
    const message = `${_countOf(still.length, 'provider CLI')} ${verb} still updating. Press r to look again.`;
    return { message, kind: ToastKind.error };
  }
  if (updated.length === 1) return { message: `Updated ${_nameOf(updated[0]!)}.`, kind: ToastKind.success };
  if (updated.length > 1) {
    return { message: `Updated ${_countOf(updated.length, 'provider CLI')}.`, kind: ToastKind.success };
  }
  if (rows.length === 0 || rows.some(({ lastUpdate }) => isLeftWhileRunning(lastUpdate))) return undefined;
  return { message: 'No provider CLI changed version.', kind: ToastKind.success };
}

function _targetOf({ machineId, machineName, provider, label }: ProviderCliRow): ProviderCliTarget {
  return { machineId, machineName, provider, label };
}

function _nameOf({ label, machineName }: ProviderCliTarget) {
  return `${label} on ${machineName}`;
}

function _countOf(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function _wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
