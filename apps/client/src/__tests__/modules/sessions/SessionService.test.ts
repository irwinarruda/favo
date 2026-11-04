import { describe, expect, test } from 'bun:test';
import { DomainError } from '@favo/domain/shared/domain-error';
import { mockDb } from '@/__tests__/db';
import { getApp } from '@/__tests__/utils/getApp';
import { container } from '@/shared/container';

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
    expect(app.state.selectedDesktopApp).toEqual({ provider: 'claude', label: 'Claude', login: 'separate' });
  });
  test('offers nothing for a provider whose app is not installed', async () => {
    const app = await getApp();
    app.state.selectRow('seat:local/personal/codex');
    expect(app.state.selectedDesktopApp).toBeUndefined();
  });
  test('offers nothing on another machine, even with the same provider', async () => {
    const app = await getApp();
    app.state.selectRow('seat:devbox/personal/claude');
    expect(app.state.selectedDesktopApp).toBeUndefined();
  });
  test('notices an app installed later, on a refresh of this machine', async () => {
    const app = await getApp();
    app.state.selectRow('seat:local/personal/codex');
    mockDb.desktopApps.push({ provider: 'codex', label: 'ChatGPT', login: 'sharedWithCli' });
    await app.state.refreshMachine('local');
    expect(app.state.selectedDesktopApp?.label).toBe('ChatGPT');
  });
  test('stops offering an app removed later, on a refresh of this machine', async () => {
    const app = await getApp();
    mockDb.desktopApps = [];
    await app.state.refreshMachine('local');
    expect(app.state.selectedDesktopApp).toBeUndefined();
  });
  test('still refreshes the machines when the app lookup fails', async () => {
    const app = await getApp({ isLoaded: false });
    const repository = container.get('IDesktopRepository');
    repository.getApps = () => Promise.reject(new Error('no lookup'));
    await expect(app.state.loadFleet()).rejects.toThrow('no lookup');
    expect(app.state.accounts.length).toBeGreaterThan(0);
  });
  test('reads the app login of each seat here whose app signs in on its own', async () => {
    const app = await getApp({ isLoaded: false });
    mockDb.appLogins['seat:local/work/claude'] = { login: 'signedIn', isOtherAccount: false };
    await app.state.loadFleet();
    const seat = (key: string) => app.state.accounts.flatMap((account) => account.seats).find((s) => s.key === key);
    expect(seat('seat:local/work/claude')?.isAppSignedIn).toBe(true);
    expect(seat('seat:local/personal/claude')?.appLogin?.login).toBe('signedOut');
    expect(seat('seat:devbox/personal/claude')?.hasAppLogin).toBe(false);
    expect(mockDb.appLoginReads).not.toContain('seat:local/work/codex');
  });
  test('reads each app login once per refresh, through the seat it belongs to', async () => {
    const app = await getApp();
    mockDb.appLoginReads = [];
    await app.state.refreshMachine('local');
    expect(mockDb.appLoginReads.toSorted()).toEqual(['seat:local/personal/claude', 'seat:local/work/claude']);
  });
  test('reads no app login for an app that shares the CLI login', async () => {
    const app = await getApp({ isLoaded: false });
    mockDb.desktopApps = [{ provider: 'codex', label: 'ChatGPT', login: 'sharedWithCli' }];
    await app.state.loadFleet();
    expect(mockDb.appLoginReads).toEqual([]);
    expect(app.state.accounts.flatMap((account) => account.seats).some((seat) => seat.hasAppLogin)).toBe(false);
  });
  test('drops the app login once the app is gone', async () => {
    const app = await getApp();
    mockDb.desktopApps = [];
    await app.state.refreshMachine('local');
    expect(app.state.selectedSeat?.hasAppLogin).toBe(false);
  });
  test('reads the app login again with the seat', async () => {
    const app = await getApp();
    app.state.selectRow('seat:local/work/claude');
    mockDb.appLogins['seat:local/work/claude'] = { login: 'signedIn', isOtherAccount: false };
    await app.state.refreshSeat(app.state.selectedSeat!);
    expect(app.state.selectedSeat?.isAppSignedIn).toBe(true);
  });
  test('keeps the status of a seat when its app login arrives late', async () => {
    const app = await getApp({ isLoaded: false });
    const repository = container.get('IDesktopRepository');
    const getLogin = repository.getLogin.bind(repository);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    repository.getLogin = async (seat) => {
      await held;
      return getLogin(seat);
    };
    const loading = app.state.loadFleet();
    await Bun.sleep(10);
    release();
    await loading;
    expect(app.state.selectedSeat?.isChecking).toBe(false);
    expect(app.state.selectedSeat?.hasAppLogin).toBe(true);
  });
  test('opens the app as the given account and says so', async () => {
    const app = await getApp();
    app.state.selectRow('seat:local/work/claude');
    expect(await app.state.openDesktopApp(app.state.selectedSeat!)).toBe('opened');
    expect(mockDb.desktopOpenings).toEqual(['seat:local/work/claude']);
    expect(app.state.toast?.message).toBe('Claude is opening as work.');
  });
  test('refreshes the seat after opening, because its links were mended', async () => {
    const app = await getApp();
    app.state.selectRow('seat:local/work/claude');
    mockDb.seatStatuses['seat:local/work/claude'] = { login: 'signedIn', identity: 'bee@work.dev', problems: 0 };
    await app.state.openDesktopApp(app.state.selectedSeat!);
    expect(app.state.selectedSeat?.problems).toBe(0);
  });
  test('leaves an open app alone until it is told to close it', async () => {
    const app = await getApp();
    mockDb.runningDesktopApps = ['claude'];
    app.state.selectRow('seat:local/work/claude');
    const seat = app.state.selectedSeat!;
    expect(await app.state.openDesktopApp(seat)).toBe('stillOpen');
    expect(mockDb.desktopOpenings).toEqual([]);
    expect(await app.state.openDesktopApp(seat, true)).toBe('opened');
    expect(mockDb.desktopOpenings).toEqual(['seat:local/work/claude']);
  });
  test('ignores a second open while the first is running', async () => {
    const app = await getApp();
    const seat = app.state.selectedSeat!;
    const opening = app.state.openDesktopApp(seat);
    expect(app.state.isDesktopAppBusy).toBe(true);
    expect(await app.state.openDesktopApp(seat)).toBeUndefined();
    await opening;
    expect(mockDb.desktopOpenings).toHaveLength(1);
    expect(app.state.isDesktopAppBusy).toBe(false);
  });
  test('is free again after a failure', async () => {
    const app = await getApp();
    mockDb.desktopFailure = new DomainError('desktopAppStuck', 'Claude did not close.');
    await expect(app.state.openDesktopApp(app.state.selectedSeat!, true)).rejects.toThrow('Claude did not close.');
    expect(app.state.isDesktopAppBusy).toBe(false);
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
