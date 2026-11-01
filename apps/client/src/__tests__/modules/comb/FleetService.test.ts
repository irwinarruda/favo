import { describe, expect, test } from 'bun:test';
import { mockDb } from '@/__tests__/db';
import { getApp } from '@/__tests__/utils/getApp';
import { MachinePresence } from '@/modules/comb/app/enums/MachinePresence';

describe('FleetService', () => {
  test('loads every machine with its accounts in one list', async () => {
    const app = await getApp();
    expect(app.state.machines.map((machine) => machine.name)).toEqual(['macbook', 'devbox', 'studio']);
    expect(app.state.accounts.map((account) => account.key)).toEqual([
      'local/personal',
      'local/work',
      'devbox/personal',
    ]);
    expect(app.state.isFleetLoading).toBe(false);
  });
  test('keeps this machine first however fast the others answer', async () => {
    const app = await getApp();
    await app.state.refreshMachine('devbox');
    expect(app.state.accounts[0]?.machineId).toBe('local');
  });
  test('summarizes the comb', async () => {
    const app = await getApp();
    expect(app.state.fleetSummary).toEqual({ machines: 3, accounts: 3, signedIn: 6 });
  });
  test('fills each seat with who is signed in', async () => {
    const app = await getApp();
    const [personal] = app.state.accounts;
    expect(personal?.seats[0]?.headline).toBe('bee@hive.dev');
    expect(personal?.seats[0]?.isSignedIn).toBe(true);
  });
  test('marks a machine that is down and keeps the others', async () => {
    const app = await getApp();
    const studio = app.state.machines.find((machine) => machine.id === 'studio');
    expect(studio?.presence).toBe(MachinePresence.offline);
    expect(studio?.message).toContain('timed out');
    expect(app.state.accounts.some((account) => account.machineId === 'studio')).toBe(false);
  });
  test('gives a machine with no seats its own row, so it can be reached', async () => {
    const app = await getApp();
    expect(app.state.combRows.at(-1)).toEqual({ key: 'machine:studio', machineId: 'studio' });
  });
  test('hides a provider that is not installed on that machine', async () => {
    const app = await getApp();
    const keys = app.state.combRows.map((row) => row.key);
    expect(keys).not.toContain('seat:local/personal/antigravity');
    expect(keys).toContain('seat:devbox/personal/antigravity');
  });
  test('reloads a machine that came back', async () => {
    const app = await getApp();
    mockDb.machineStatuses.studio = { state: 'online' };
    mockDb.accounts.studio = [mockDb.accounts.devbox![0]!];
    await app.state.refreshMachine('studio');
    expect(app.state.accounts.some((account) => account.machineId === 'studio')).toBe(true);
    expect(app.state.machines.find((machine) => machine.id === 'studio')?.isOnline).toBe(true);
  });
  test('drops accounts of a machine that went away', async () => {
    const app = await getApp();
    mockDb.machineStatuses.devbox = { state: 'offline', message: 'gone' };
    await app.state.refreshMachine('devbox');
    expect(app.state.accounts.some((account) => account.machineId === 'devbox')).toBe(false);
  });
});
