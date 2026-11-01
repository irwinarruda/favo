import { describe, expect, test } from 'bun:test';
import { mockDb } from '@/__tests__/db';
import { getApp } from '@/__tests__/utils/getApp';

describe('SessionService', () => {
  test('launches a signed in seat', async () => {
    const app = await getApp();
    await app.state.openSelectedSeat();
    expect(mockDb.terminalRuns).toEqual([{ command: 'claude', args: ['launch', 'personal'], env: {}, unsetEnv: [] }]);
  });
  test('launches with no folder on a machine named like an inherited property', async () => {
    const id: string = 'constructor';
    const app = await getApp();
    mockDb.machines.push({ id, name: id, target: `bee@${id}`, isLocal: false });
    mockDb.machineStatuses[id] = { state: 'online' };
    mockDb.accounts[id] = mockDb.accounts.devbox!;
    await app.state.loadFleet();
    app.state.selectRow(`seat:${id}/personal/claude`);
    expect(app.state.selectedSeat?.machineId).toBe(id);
    await app.state.launchSelectedSeat();
    expect(mockDb.terminalRuns.at(-1)?.cwd).toBeUndefined();
  });
  test('signs in a seat that is signed out, and refreshes it after', async () => {
    const app = await getApp();
    app.state.selectRow('seat:local/work/codex');
    mockDb.seatStatuses['seat:local/work/codex'] = { login: 'signedIn', identity: 'new@bee.dev', problems: 0 };
    await app.state.openSelectedSeat();
    expect(mockDb.terminalRuns[0]?.args).toEqual(['login', 'work']);
    expect(app.state.selectedSeat?.identity).toBe('new@bee.dev');
  });
  test('signs out and refreshes', async () => {
    const app = await getApp();
    mockDb.seatStatuses['seat:local/personal/claude'] = { login: 'signedOut', problems: 0 };
    await app.state.signOutSelectedSeat();
    expect(mockDb.terminalRuns[0]?.args).toEqual(['logout', 'personal']);
    expect(app.state.selectedSeat?.isSignedIn).toBe(false);
  });
  test('lets the caller see a refused sign-out', async () => {
    const app = await getApp();
    app.state.selectRow('seat:devbox/personal/antigravity');
    await expect(app.state.signOutSelectedSeat()).rejects.toMatchObject({ code: 'logoutUnsupported' });
  });
  test('copies the real path, creating the folder first, and says where it goes', async () => {
    const app = await getApp();
    app.state.selectRow('seat:local/work/claude');
    await app.state.copySelectedPath();
    expect(mockDb.provisioned).toEqual(['seat:local/work/claude']);
    expect(mockDb.clipboard).toEqual(['/Users/bee/.favo/accounts/work/claude']);
    expect(app.state.toast?.message).toBe('Copied. Paste it into T3 Code as CLAUDE_CONFIG_DIR path.');
  });
  test('copies a path from another machine too', async () => {
    const app = await getApp();
    app.state.selectRow('seat:devbox/personal/codex');
    await app.state.copySelectedPath();
    expect(mockDb.clipboard).toEqual(['/home/bee/.codex']);
  });
  test('repairs the selected machine and reports it', async () => {
    const app = await getApp();
    mockDb.repairedLinks = 2;
    app.state.moveMachine(1);
    await app.state.repairSelectedMachine();
    expect(mockDb.repaired).toEqual(['devbox']);
    expect(app.state.toast?.message).toBe('Mended 2 shared links.');
  });
  test('offers the app of the selected seat on this machine', async () => {
    const app = await getApp();
    expect(app.state.selectedDesktopApp).toEqual({ provider: 'claude', label: 'Claude' });
  });
  test('offers nothing for a provider whose app is not installed', async () => {
    const app = await getApp();
    app.state.selectRow('seat:local/personal/codex');
    expect(app.state.selectedDesktopApp).toBeUndefined();
    expect(await app.state.openSelectedDesktopApp()).toBeUndefined();
    expect(mockDb.desktopOpenings).toEqual([]);
  });
  test('offers nothing on another machine, even with the same provider', async () => {
    const app = await getApp();
    app.state.selectRow('seat:devbox/personal/claude');
    expect(app.state.selectedDesktopApp).toBeUndefined();
    expect(await app.state.openSelectedDesktopApp()).toBeUndefined();
  });
  test('opens the app as the selected account and says so', async () => {
    const app = await getApp();
    app.state.selectRow('seat:local/work/claude');
    expect(await app.state.openSelectedDesktopApp()).toBe('opened');
    expect(mockDb.desktopOpenings).toEqual(['seat:local/work/claude']);
    expect(app.state.toast?.message).toBe('Claude is opening as work.');
  });
  test('leaves an open app alone until it is told to close it', async () => {
    const app = await getApp();
    mockDb.runningDesktopApps = ['claude'];
    app.state.selectRow('seat:local/work/claude');
    expect(await app.state.openSelectedDesktopApp()).toBe('stillOpen');
    expect(mockDb.desktopOpenings).toEqual([]);
    expect(await app.state.openSelectedDesktopApp(true)).toBe('opened');
    expect(mockDb.desktopOpenings).toEqual(['seat:local/work/claude']);
  });
  test('does nothing on a machine row', async () => {
    const app = await getApp();
    app.state.selectRow('machine:studio');
    await app.state.openSelectedSeat();
    await app.state.copySelectedPath();
    await app.state.repairSelectedMachine();
    expect(mockDb.terminalRuns).toHaveLength(0);
    expect(mockDb.clipboard).toHaveLength(0);
    expect(mockDb.repaired).toHaveLength(0);
  });
});
