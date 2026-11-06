import { afterEach, describe, expect, jest, test } from 'bun:test';
import type { ProviderVersionView } from '@favo/contracts/rpc/views';
import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { RunningReason } from '@favo/domain/updates/update-outcome';
import { mockDb } from '@/__tests__/db';
import { getApp } from '@/__tests__/utils/getApp';

async function openApp(prepare?: () => void) {
  const app = await getApp({ isLoaded: false });
  prepare?.();
  await app.state.loadFleet();
  while (app.state.isProviderClisReading) await Bun.sleep(1);
  return app;
}

function groupOf(app: Awaited<ReturnType<typeof getApp>>, label: string) {
  return app.state.providerCliGroups.find((group) => group.label === label);
}

function lineOf(app: Awaited<ReturnType<typeof getApp>>, id: string) {
  return app.state.providerCliMachineLines.find((line) => line.id === id);
}

describe('reading the provider CLIs', () => {
  test('happens once after the comb loads, on every machine it can reach', async () => {
    await openApp();
    expect(mockDb.providerVersionReads.toSorted()).toEqual(['devbox', 'local']);
  });
  test('never makes the comb wait for it', async () => {
    const app = await getApp({ isLoaded: false });
    const { promise, resolve } = Promise.withResolvers<void>();
    mockDb.providerVersionHold = promise;
    await app.state.loadFleet();
    expect(app.state.isFleetLoading).toBe(false);
    expect(app.state.isProviderClisReading).toBe(true);
    expect(lineOf(app, 'devbox')?.label).toBe('reading…');
    resolve();
  });
  test('is ready when the screen opens, with no second read', async () => {
    const app = await openApp();
    await app.state.openProviderClis();
    expect(app.state.isProviderClisOpen).toBe(true);
    expect(mockDb.providerVersionReads).toHaveLength(2);
  });
  test('reads every machine again on refresh', async () => {
    const app = await openApp();
    mockDb.providerVersionReads = [];
    await app.state.refreshProviderClis();
    expect(mockDb.providerVersionReads.toSorted()).toEqual(['devbox', 'local']);
  });
  test('closes the screen', async () => {
    const app = await openApp();
    await app.state.openProviderClis();
    app.state.closeProviderClis();
    expect(app.state.isProviderClisOpen).toBe(false);
  });
});

describe('what the screen lists', () => {
  test('puts each provider together, one row per machine, in machine order', async () => {
    const app = await openApp();
    expect(app.state.providerCliGroups.map(({ label }) => label)).toEqual([
      'Claude Code',
      'Codex',
      'Antigravity',
      'OpenCode',
    ]);
    expect(groupOf(app, 'Claude Code')?.rows.map(({ machineName, version }) => [machineName, version])).toEqual([
      ['macbook', '2.1.316'],
      ['devbox', '2.1.290'],
    ]);
  });
  test('marks a version that is older than on another machine', async () => {
    const app = await openApp();
    const claude = groupOf(app, 'Claude Code')?.rows.map(({ machineName, isOlder }) => [machineName, isOlder]);
    expect(claude).toEqual([
      ['macbook', false],
      ['devbox', true],
    ]);
    expect(groupOf(app, 'Codex')?.rows.every(({ isOlder }) => !isOlder)).toBe(true);
  });
  test('carries how each was installed and what its last update did', async () => {
    const app = await openApp();
    const [mac, devbox] = groupOf(app, 'Claude Code')!.rows;
    expect(mac?.installedWith).toBe('Homebrew cask claude-code');
    expect(mac?.lastUpdate).toBeUndefined();
    expect(devbox?.lastUpdate).toMatchObject({ state: 'failed', reason: 'exit 1' });
  });
  test('names how many CLIs each machine has, and why one has none', async () => {
    const app = await openApp();
    expect(lineOf(app, 'local')?.label).toBe('3 CLIs');
    expect(lineOf(app, 'studio')).toMatchObject({ label: 'offline', isOld: true });
  });
  test('calls a machine on an older favo just that', async () => {
    const app = await openApp(() => {
      mockDb.providerVersionFailures.devbox = new DomainError(DomainErrorCode.unknownMethod, 'Unknown method');
    });
    expect(lineOf(app, 'devbox')).toMatchObject({ label: 'older favo', isOld: true });
    expect(groupOf(app, 'Antigravity')).toBeUndefined();
  });
  test('reads a machine again once its favo is current, instead of keeping older favo', async () => {
    const app = await openApp(() => {
      mockDb.providerVersionFailures.devbox = new DomainError(DomainErrorCode.unknownMethod, 'Unknown method');
    });
    mockDb.providerVersionFailures = {};
    mockDb.providerVersionReads = [];
    await app.state.openProviderClis();
    expect(mockDb.providerVersionReads).toEqual(['devbox']);
    expect(lineOf(app, 'devbox')?.label).toBe('3 CLIs');
  });
  test('says so when a machine could not be read, and keeps what it had', async () => {
    const app = await openApp();
    mockDb.providerVersionFailures.devbox = new DomainError(DomainErrorCode.machineUnreachable, 'devbox: gone');
    await app.state.refreshProviderClis();
    expect(lineOf(app, 'devbox')).toMatchObject({ label: 'could not read', isOld: true });
    expect(groupOf(app, 'Antigravity')?.rows).toHaveLength(1);
  });
});

describe('noticing a provider CLI that fell behind', () => {
  test('says once that it is older than on another machine, and how to update', async () => {
    const app = await openApp();
    expect(app.state.toast?.message).toBe(
      'Claude Code on devbox is older than on another machine. Press P to update every machine.'
    );
    app.state.clearToast(app.state.toast!.id);
    await app.state.refreshProviderClis();
    expect(app.state.toast).toBeUndefined();
  });
  test('counts them when there are several', async () => {
    const app = await openApp(() => {
      mockDb.providerVersions.devbox![1] = { ...mockDb.providerVersions.devbox![1]!, version: '0.160.0' };
    });
    expect(app.state.toast?.message).toBe(
      '2 provider CLIs are older than on another machine. Press P to update every machine.'
    );
  });
  test('says nothing when every machine has the same versions', async () => {
    const app = await openApp(() => {
      mockDb.providerVersions.devbox![0] = { ...mockDb.providerVersions.devbox![0]!, version: '2.1.316' };
    });
    expect(app.state.providerClisBehind).toEqual([]);
    expect(app.state.toast).toBeUndefined();
  });
});

describe('updating every provider CLI', () => {
  async function wait(ms: number) {
    jest.advanceTimersByTime(ms);
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
  }

  async function startUpdate(prepare?: () => void) {
    const app = await openApp(prepare);
    jest.useFakeTimers();
    const run = app.state.updateProviderClis();
    await wait(0);
    return { app, run };
  }

  function finish(machineId: string, changes: Record<string, Partial<ProviderVersionView>> = {}) {
    mockDb.providerVersions[machineId] = mockDb.providerVersions[machineId]!.map((view) => ({
      ...view,
      lastUpdate: undefined,
      ...changes[view.provider],
    }));
  }

  function rowOf(app: Awaited<ReturnType<typeof getApp>>, label: string, machineName: string) {
    return groupOf(app, label)?.rows.find((row) => row.machineName === machineName);
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  test('starts on every machine it can reach at once, and opens the list', async () => {
    const { app } = await startUpdate();
    expect(mockDb.providerUpdateStarts.map(({ machineId }) => machineId).toSorted()).toEqual(['devbox', 'local']);
    expect(app.state.isProviderClisOpen).toBe(true);
    expect(app.state.isUpdatingProviderClis).toBe(true);
  });
  test('shows each CLI updating, and each machine too', async () => {
    const { app } = await startUpdate();
    expect(rowOf(app, 'Claude Code', 'devbox')).toMatchObject({ isUpdating: true });
    expect(rowOf(app, 'Codex', 'macbook')).toMatchObject({ isUpdating: true });
    expect(lineOf(app, 'devbox')?.label).toBe('updating…');
  });
  test('follows each machine until its CLIs are done, then shows what changed', async () => {
    const { app, run } = await startUpdate();
    finish('local');
    finish('devbox', { claude: { version: '2.1.316' } });
    await wait(2_000);
    expect(await run).toEqual([]);
    expect(rowOf(app, 'Claude Code', 'devbox')).toMatchObject({ updatedFrom: '2.1.290', isOlder: false });
    expect(rowOf(app, 'Codex', 'devbox')).toMatchObject({ isUnchanged: true, updatedFrom: undefined });
    expect(app.state.toast?.message).toBe('Updated Claude Code on devbox.');
    expect(app.state.isUpdatingProviderClis).toBe(false);
  });
  test('keeps following a machine whose CLIs are still updating', async () => {
    const { app } = await startUpdate();
    finish('local');
    await wait(2_000);
    expect(lineOf(app, 'devbox')?.label).toBe('updating…');
    expect(app.state.isUpdatingProviderClis).toBe(true);
    mockDb.providerVersionReads = [];
    await wait(2_000);
    expect(mockDb.providerVersionReads).toEqual(['devbox']);
  });
  test('says so when one did not update', async () => {
    const { app, run } = await startUpdate();
    finish('local');
    finish('devbox', { claude: { lastUpdate: { state: 'failed', reason: 'exit 1', at: new Date().toISOString() } } });
    await wait(2_000);
    await run;
    expect(app.state.toast).toMatchObject({
      message: '1 provider CLI did not update. Run favo update --providers to see why.',
      kind: 'error',
    });
  });
  test('says so when nothing changed', async () => {
    const { app, run } = await startUpdate();
    finish('local');
    finish('devbox');
    await wait(2_000);
    await run;
    expect(app.state.toast?.message).toBe('No provider CLI changed version.');
  });
  test('hands back the ones left alone because they were running, for the comb to ask about', async () => {
    const { app, run } = await startUpdate();
    const at = new Date().toISOString();
    finish('local', { codex: { lastUpdate: { state: 'leftAlone', reason: RunningReason, at } } });
    finish('devbox');
    await wait(2_000);
    expect(await run).toEqual([{ machineId: 'local', machineName: 'macbook', provider: 'codex', label: 'Codex' }]);
    expect(app.state.toast?.message).not.toBe('No provider CLI changed version.');
  });
  test('updates just those when asked again, even while they run', async () => {
    const app = await openApp();
    jest.useFakeTimers();
    const target = { machineId: 'local', machineName: 'macbook', provider: 'codex', label: 'Codex' } as const;
    void app.state.updateProviderClis({ targets: [target], isRunningIncluded: true });
    await wait(0);
    expect(mockDb.providerUpdateStarts).toEqual([
      { machineId: 'local', providers: ['codex'], isRunningIncluded: true },
    ]);
    expect(rowOf(app, 'Claude Code', 'macbook')?.isUpdating).toBe(false);
    expect(rowOf(app, 'Codex', 'macbook')?.isUpdating).toBe(true);
  });
  test('updates favo first on a machine that runs an older one', async () => {
    const app = await openApp();
    mockDb.machineStatuses.devbox = { state: 'online', version: '0.0.1', isBehind: true };
    await app.state.refreshMachine('devbox');
    jest.useFakeTimers();
    void app.state.updateProviderClis();
    await wait(0);
    expect(mockDb.installed).toEqual(['devbox']);
    expect(mockDb.providerUpdateStarts.map(({ machineId }) => machineId)).toContain('devbox');
  });
  test('names a machine on a favo too old to start it', async () => {
    const { app, run } = await startUpdate(() => {
      mockDb.providerUpdateFailures.devbox = new DomainError(DomainErrorCode.unknownMethod, 'Unknown method');
    });
    finish('local');
    await wait(2_000);
    await run;
    expect(app.state.toast).toMatchObject({
      message: 'devbox runs an older favo. Press U to update it first. No provider CLI changed version.',
      kind: 'error',
    });
  });
  test('names the machine favo could not start on, and still says what happened elsewhere', async () => {
    const { app, run } = await startUpdate(() => {
      mockDb.providerUpdateFailures.devbox = new DomainError(DomainErrorCode.updateNotStarted, 'favo could not start.');
    });
    finish('local', { claude: { version: '2.1.320' } });
    await wait(2_000);
    await run;
    expect(app.state.toast?.message).toBe(
      'favo could not start updating the provider CLIs on devbox. Updated Claude Code on macbook.'
    );
  });
  test('claims nothing on a machine where the update never started', async () => {
    const { app, run } = await startUpdate(() => {
      mockDb.providerUpdateFailures.devbox = new DomainError(DomainErrorCode.machineUnreachable, 'devbox: gone');
      const at = new Date().toISOString();
      const codex = mockDb.providerVersions.devbox![1]!;
      mockDb.providerVersions.devbox![1] = { ...codex, lastUpdate: { state: 'leftAlone', reason: RunningReason, at } };
    });
    finish('local');
    await wait(2_000);
    expect(await run).toEqual([]);
    expect(groupOf(app, 'Antigravity')?.rows[0]).toMatchObject({ isUnchanged: false, updatedFrom: undefined });
  });
  test('stops following a machine it can no longer read, and says it is still updating there', async () => {
    const { app, run } = await startUpdate();
    finish('local');
    mockDb.providerVersionFailures.devbox = new DomainError(DomainErrorCode.machineUnreachable, 'devbox: gone');
    await wait(2_000);
    await run;
    expect(app.state.toast).toMatchObject({
      message: 'devbox: gone. 3 provider CLIs are still updating. Press r to look again.',
      kind: 'error',
    });
    expect(rowOf(app, 'Claude Code', 'devbox')?.isUpdating).toBe(false);
    expect(lineOf(app, 'devbox')?.label).toBe('could not read');
  });
  test('says a CLI is still updating when it stops following after fifteen minutes', async () => {
    const { app, run } = await startUpdate();
    finish('local');
    for (let poll = 0; poll < 451; poll++) await wait(2_000);
    await run;
    expect(app.state.toast).toMatchObject({
      message: '3 provider CLIs are still updating. Press r to look again.',
      kind: 'error',
    });
  });
  test('counts a machine it never read before, such as one that ran an older favo', async () => {
    const app = await openApp(() => {
      mockDb.machineStatuses.devbox = { state: 'outdated' };
    });
    expect(lineOf(app, 'devbox')?.label).toBe('older favo');
    jest.useFakeTimers();
    mockDb.providerUpdateOutcomes.local = {};
    mockDb.providerUpdateOutcomes.devbox = { claude: { version: '2.1.316' } };
    await app.state.updateProviderClis();
    expect(mockDb.installed).toEqual(['devbox']);
    expect(rowOf(app, 'Claude Code', 'devbox')?.updatedFrom).toBe('2.1.290');
    expect(app.state.toast?.message).toBe('Updated Claude Code on devbox.');
  });
  test('updates the CLIs of every machine favo reached, even when another install failed', async () => {
    const app = await openApp(() => {
      mockDb.machineStatuses.devbox = { state: 'online', version: '0.0.1', isBehind: true };
      mockDb.machineStatuses.studio = { state: 'outdated' };
      mockDb.installFailures.devbox = new DomainError(DomainErrorCode.machineUnreachable, 'devbox: gone');
    });
    jest.useFakeTimers();
    void app.state.updateProviderClis();
    await wait(0);
    expect(mockDb.providerUpdateStarts.map(({ machineId }) => machineId).toSorted()).toEqual([
      'devbox',
      'local',
      'studio',
    ]);
  });
  test('leaves out of the notice a CLI that is already updating', async () => {
    const app = await openApp(() => {
      const claude = mockDb.providerVersions.devbox![0]!;
      const lastUpdate = { state: 'updating', from: '2.1.290', at: new Date().toISOString() } as const;
      mockDb.providerVersions.devbox![0] = { ...claude, lastUpdate };
    });
    expect(app.state.providerClisBehind).toEqual([]);
    expect(app.state.toast).toBeUndefined();
  });
  test('follows an update already running when it opens, until it is done', async () => {
    jest.useFakeTimers();
    const app = await getApp({ isLoaded: false });
    const claude = mockDb.providerVersions.devbox![0]!;
    mockDb.providerVersions.devbox![0] = {
      ...claude,
      lastUpdate: { state: 'updating', from: '2.1.290', at: new Date().toISOString() },
    };
    await app.state.loadFleet();
    await wait(0);
    expect(rowOf(app, 'Claude Code', 'devbox')?.isUpdating).toBe(true);
    mockDb.providerVersions.devbox![0] = { ...claude, version: '2.1.316', lastUpdate: undefined };
    await wait(2_000);
    expect(rowOf(app, 'Claude Code', 'devbox')).toMatchObject({ isUpdating: false, version: '2.1.316' });
  });
  test('does not start a second time while one is going', async () => {
    const { app } = await startUpdate();
    expect(await app.state.updateProviderClis()).toEqual([]);
    expect(mockDb.providerUpdateStarts).toHaveLength(2);
  });
});
