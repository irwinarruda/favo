import { describe, expect, test } from 'bun:test';
import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
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

describe('updating the provider CLIs of a machine', () => {
  test('hands the terminal over for that machine', async () => {
    const app = await getApp();
    await app.state.updateProviders('devbox');
    expect(mockDb.terminalRuns).toEqual([{ command: 'favo', args: ['update', 'devbox'], env: {}, unsetEnv: [] }]);
  });
  test('updates no provider CLI on a machine it cannot reach', async () => {
    const app = await getApp();
    await app.state.updateProviders('studio');
    expect(mockDb.terminalRuns).toEqual([]);
  });
  test('says so when that update does not finish', async () => {
    const app = await getApp();
    mockDb.terminalExitCode = 255;
    await app.state.updateProviders('devbox');
    expect(app.state.toast?.message).toBe('The update on devbox did not finish.');
  });
  test('updates the machine it was asked for, whatever is selected by then', async () => {
    const app = await getApp();
    app.state.selectRow('seat:local/personal/claude');
    await app.state.updateProviders('devbox');
    expect(mockDb.terminalRuns[0]?.args).toEqual(['update', 'devbox']);
  });
  test('reads that machine again afterwards and shows what happened', async () => {
    const app = await openApp();
    mockDb.providerVersionReads = [];
    mockDb.providerVersions.devbox![0] = {
      ...mockDb.providerVersions.devbox![0]!,
      version: '2.1.316',
      lastUpdate: undefined,
    };
    await app.state.updateProviders('devbox');
    expect(mockDb.providerVersionReads).toEqual(['devbox']);
    expect(app.state.isProviderClisOpen).toBe(true);
    const devbox = groupOf(app, 'Claude Code')?.rows[1];
    expect(devbox).toMatchObject({ version: '2.1.316', isOlder: false });
    expect(devbox?.lastUpdate).toBeUndefined();
  });
});
