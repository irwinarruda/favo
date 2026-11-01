import { describe, expect, test } from 'bun:test';
import { mockDb } from '@/__tests__/db';
import { getApp } from '@/__tests__/utils/getApp';

describe('DirectoryService', () => {
  test('shows the folder the machine reports', async () => {
    const app = await getApp();
    expect(app.state.selectedDirectory).toBe('/Users/bee/code/hive');
    app.state.moveMachine(1);
    expect(app.state.selectedDirectory).toBe('/home/bee');
  });
  test('finds no chosen folder for a machine named like an inherited property', async () => {
    const id: string = 'constructor';
    const app = await getApp();
    mockDb.machines.push({ id, name: id, target: `bee@${id}`, isLocal: false });
    mockDb.machineStatuses[id] = { state: 'online', directory: '/srv/odd' };
    mockDb.accounts[id] = [];
    await app.state.loadFleet();
    app.state.selectRow(`machine:${id}`);
    expect(app.state.selectedDirectory).toBe('/srv/odd');
  });
  test('opens inside the current folder, written short', async () => {
    const app = await getApp();
    await app.state.openDirectoryPicker();
    expect(app.state.directoryInput).toBe('~/code/hive/');
    expect(app.state.directoryEntries.map((entry) => entry.name)).toEqual(['apps', 'packages']);
  });
  test('does not open on a machine that is down', async () => {
    const app = await getApp();
    app.state.selectRow('machine:studio');
    await app.state.openDirectoryPicker();
    expect(app.state.isDirectoryPickerOpen).toBe(false);
  });
  test('filters as you type', async () => {
    const app = await getApp();
    await app.state.openDirectoryPicker();
    await app.state.changeDirectoryInput('~/D');
    expect(app.state.directoryEntries.map((entry) => entry.name)).toEqual([
      'Desktop',
      'Developer',
      'Documents',
      'Downloads',
    ]);
  });
  test('moves the highlight and wraps around', async () => {
    const app = await getApp();
    await app.state.openDirectoryPicker();
    app.state.moveDirectoryHighlight(1);
    expect(app.state.highlightedDirectoryIndex).toBe(0);
    app.state.moveDirectoryHighlight(-1);
    expect(app.state.highlightedDirectoryIndex).toBe(1);
  });
  test('completes the first match, or the highlighted one', async () => {
    const app = await getApp();
    await app.state.openDirectoryPicker();
    await app.state.changeDirectoryInput('~/Doc');
    await app.state.completeDirectory();
    expect(app.state.directoryInput).toBe('~/Documents/');
    app.state.moveDirectoryHighlight(1);
    app.state.moveDirectoryHighlight(1);
    await app.state.completeDirectory();
    expect(app.state.directoryInput).toBe('~/Documents/projects/');
  });
  test('goes up one folder', async () => {
    const app = await getApp();
    await app.state.openDirectoryPicker();
    await app.state.goUpDirectory();
    expect(app.state.directoryInput).toBe('~/code/');
  });
  test('enter opens the highlighted folder instead of choosing it', async () => {
    const app = await getApp();
    await app.state.openDirectoryPicker();
    app.state.moveDirectoryHighlight(1);
    await app.state.submitDirectory();
    expect(app.state.directoryInput).toBe('~/code/hive/apps/');
    expect(app.state.isDirectoryPickerOpen).toBe(true);
  });
  test('enter chooses the typed folder and closes', async () => {
    const app = await getApp();
    await app.state.openDirectoryPicker();
    await app.state.changeDirectoryInput('~/Documents/projects');
    await app.state.submitDirectory();
    expect(app.state.selectedDirectory).toBe('/Users/bee/Documents/projects');
    expect(app.state.isDirectoryPickerOpen).toBe(false);
    expect(app.state.toast?.message).toBe('macbook launches in ~/Documents/projects.');
  });
  test('refuses a folder that does not exist and stays open', async () => {
    const app = await getApp();
    await app.state.openDirectoryPicker();
    await app.state.changeDirectoryInput('~/nothing');
    await app.state.submitDirectory();
    expect(app.state.directoryError).toBe('No folder at /Users/bee/nothing.');
    expect(app.state.isDirectoryPickerOpen).toBe(true);
    expect(app.state.selectedDirectory).toBe('/Users/bee/code/hive');
  });
  test('keeps each machine in its own folder', async () => {
    const app = await getApp();
    app.state.moveMachine(1);
    await app.state.openDirectoryPicker();
    expect(app.state.directoryInput).toBe('~/');
    await app.state.changeDirectoryInput('~/srv');
    await app.state.submitDirectory();
    expect(app.state.selectedDirectory).toBe('/home/bee/srv');
    app.state.moveMachine(-1);
    expect(app.state.selectedDirectory).toBe('/Users/bee/code/hive');
  });
  test('survives a refresh of the machine', async () => {
    const app = await getApp();
    await app.state.openDirectoryPicker();
    await app.state.changeDirectoryInput('~/Documents');
    await app.state.submitDirectory();
    await app.state.refreshMachine('local');
    await app.state.loadFleet();
    expect(app.state.selectedDirectory).toBe('/Users/bee/Documents');
  });
  test('launches in the chosen folder, on that machine only', async () => {
    const app = await getApp();
    await app.state.openDirectoryPicker();
    await app.state.changeDirectoryInput('~/Documents');
    await app.state.submitDirectory();
    await app.state.launchSelectedSeat();
    expect(mockDb.terminalRuns[0]?.cwd).toBe('/Users/bee/Documents');
    app.state.moveMachine(1);
    await app.state.launchSelectedSeat();
    expect(mockDb.terminalRuns[1]?.cwd).toBeUndefined();
  });
  test('signing in does not depend on the launch folder', async () => {
    const app = await getApp();
    await app.state.openDirectoryPicker();
    await app.state.changeDirectoryInput('~/Documents');
    await app.state.submitDirectory();
    await app.state.signInSelectedSeat();
    expect(mockDb.terminalRuns[0]?.cwd).toBeUndefined();
  });
  test('ignores a slow answer for what you typed before', async () => {
    const app = await getApp();
    await app.state.openDirectoryPicker();
    const slow = app.state.changeDirectoryInput('~/D');
    await app.state.changeDirectoryInput('~/code/');
    await slow;
    expect(app.state.directoryEntries.map((entry) => entry.name)).toContain('hive');
  });
  test('cancels without changing anything', async () => {
    const app = await getApp();
    await app.state.openDirectoryPicker();
    await app.state.changeDirectoryInput('~/Documents');
    app.state.closeDirectoryPicker();
    expect(app.state.selectedDirectory).toBe('/Users/bee/code/hive');
  });
  test('starts a Windows folder as Windows, without shortening it', async () => {
    const app = await getApp();
    mockDb.machineStatuses.devbox = { state: 'online', directory: 'C:\\Users\\bee' };
    await app.state.refreshMachine('devbox');
    app.state.selectRow('seat:devbox/personal/claude');
    await app.state.openDirectoryPicker();
    expect(app.state.directoryInput).toBe('C:\\Users\\bee\\');
  });
});
