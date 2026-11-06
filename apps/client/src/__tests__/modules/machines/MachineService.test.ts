import { describe, expect, test } from 'bun:test';
import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { mockDb } from '@/__tests__/db';
import { getApp } from '@/__tests__/utils/getApp';

describe('MachineService', () => {
  test('discovers what it can reach when opened', async () => {
    const app = await getApp();
    await app.state.openAddMachine();
    expect(app.state.discoveredMachines.map((machine) => machine.name)).toEqual(['pi', 'buildbox']);
  });
  test('joins a machine and installs favo on it in one step', async () => {
    const app = await getApp();
    await app.state.openAddMachine();
    await app.state.submitAddMachine('bee@pi');
    expect(mockDb.installed).toEqual(['pi']);
    expect(app.state.machines.find((machine) => machine.id === 'pi')?.isOnline).toBe(true);
    expect(app.state.isAddMachineOpen).toBe(false);
    expect(app.state.toast?.message).toBe('pi joined the comb.');
  });
  test('keeps the dialog open when the machine cannot be reached', async () => {
    const app = await getApp();
    await app.state.openAddMachine();
    await app.state.submitAddMachine('down@host');
    expect(app.state.addMachineError).toBe('down@host: connection refused');
    expect(app.state.isAddMachineOpen).toBe(true);
    expect(app.state.isJoiningMachine).toBe(false);
  });
  test('installs favo on a machine that needs it', async () => {
    const app = await getApp();
    mockDb.machineStatuses.studio = { state: 'needsInstall' };
    await app.state.refreshMachine('studio');
    app.state.selectRow('machine:studio');
    await app.state.installSelectedMachine();
    expect(mockDb.installed).toEqual(['studio']);
    expect(app.state.selectedMachine?.isOnline).toBe(true);
  });
  test('updates a machine that runs an older favo', async () => {
    const app = await getApp();
    mockDb.machineStatuses.devbox = { state: 'online', version: '0.0.1', isBehind: true };
    await app.state.refreshMachine('devbox');
    expect(app.state.hasMachinesBehind).toBe(true);
    app.state.selectRow('seat:devbox/personal/antigravity');
    await app.state.installSelectedMachine();
    expect(mockDb.installed).toEqual(['devbox']);
    expect(app.state.hasMachinesBehind).toBe(false);
  });
  test('updates every machine that is behind, and leaves the rest alone', async () => {
    const app = await getApp();
    mockDb.machineStatuses.devbox = { state: 'online', version: '0.0.1', isBehind: true };
    mockDb.machineStatuses.studio = { state: 'outdated' };
    await app.state.loadFleet();
    await app.state.updateAllMachines();
    expect(mockDb.installed.toSorted()).toEqual(['devbox', 'studio']);
    expect(app.state.toast?.message).toBe('favo 0.1.0 is running on devbox, studio.');
    expect(app.state.hasMachinesBehind).toBe(false);
  });
  test('finishes every other machine when one fails, then says which failed', async () => {
    const app = await getApp();
    mockDb.machineStatuses.devbox = { state: 'online', version: '0.0.1', isBehind: true };
    mockDb.machineStatuses.studio = { state: 'outdated' };
    mockDb.installFailures.devbox = new DomainError(DomainErrorCode.machineUnreachable, 'devbox: gone');
    await app.state.loadFleet();
    await app.state.updateAllMachines();
    expect(mockDb.installed).toEqual(['studio']);
    expect(app.state.machines.find(({ id }) => id === 'studio')?.isOnline).toBe(true);
    expect(app.state.toast).toMatchObject({ message: 'devbox: gone', kind: 'error' });
  });
  test('does not install where it is not needed', async () => {
    const app = await getApp();
    await app.state.installSelectedMachine();
    expect(mockDb.installed).toHaveLength(0);
  });
  test('forgets a remote machine and never this one', async () => {
    const app = await getApp();
    await app.state.forgetSelectedMachine();
    expect(app.state.machines).toHaveLength(3);
    app.state.selectRow('machine:studio');
    await app.state.forgetSelectedMachine();
    expect(app.state.machines.map((machine) => machine.id)).toEqual(['local', 'devbox']);
  });
});
