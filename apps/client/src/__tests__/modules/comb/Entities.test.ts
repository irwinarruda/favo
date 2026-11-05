import { describe, expect, test } from 'bun:test';
import { Machine } from '@/modules/comb/app/entities/Machine';
import { Seat } from '@/modules/comb/app/entities/Seat';
import { MachinePresence } from '@/modules/comb/app/enums/MachinePresence';
import { shortPath } from '@/modules/comb/parsers/shortPath';

const view = {
  account: 'work',
  provider: 'claude',
  label: 'Claude Code',
  path: '/Users/bee/.favo/accounts/work/claude',
  pathHint: 'CLAUDE_CONFIG_DIR path',
  loginScope: 'perAccount',
  isInstalled: true,
  isProvisioned: true,
  canLogout: true,
} as const;

describe('Seat', () => {
  test('says what to show for each state', () => {
    const seat = Seat.fromJSON('local', view);
    expect(seat.headline).toBe('checking');
    expect(seat.isChecking).toBe(true);
    expect(seat.withStatus({ login: 'signedOut', problems: 0 }).headline).toBe('sign in');
    expect(seat.withStatus({ login: 'signedIn', problems: 0 }).headline).toBe('signed in');
    expect(seat.withStatus({ login: 'signedIn', identity: 'a@b', problems: 0 }).headline).toBe('a@b');
    expect(seat.withStatus({ login: 'unknown', problems: 0 }).headline).toBe('unknown');
  });
  test('only offers sign-out when signed in and the provider can', () => {
    const seat = Seat.fromJSON('local', view).withStatus({ login: 'signedIn', problems: 0 });
    expect(seat.canSignOut).toBe(true);
    expect(Seat.fromJSON('local', { ...view, canLogout: false }).canSignOut).toBe(false);
    expect(seat.withStatus({ login: 'signedOut', problems: 0 }).canSignOut).toBe(false);
  });
  test('flags a provider whose login favo could not verify as separate', () => {
    expect(Seat.fromJSON('local', { ...view, loginScope: 'unverified' }).hasSharedLogin).toBe(true);
  });
  test('says a login shared by the whole computer is not sealed in the cell', () => {
    const seat = Seat.fromJSON('local', { ...view, label: 'Antigravity', loginScope: 'perComputer' });
    expect(seat.hasSharedLogin).toBe(true);
    expect(seat.sharedLoginNote).toBe('Every Antigravity cell on this computer shares one login.');
    expect(seat.sealedItems).toBe('threads, history');
    expect(Seat.fromJSON('local', view).hasSharedLogin).toBe(false);
    expect(Seat.fromJSON('local', view).sealedItems).toBe('login, threads, history');
  });
  test('says how the app is signed in, apart from the CLI', () => {
    const seat = Seat.fromJSON('local', view).withStatus({ login: 'signedOut', problems: 0 });
    expect(seat.hasAppLogin).toBe(false);
    expect(seat.withAppLogin({ login: 'signedIn', isOtherAccount: false }).appLoginLabel).toBe('signed in');
    expect(seat.withAppLogin({ login: 'signedOut', isOtherAccount: false }).appLoginLabel).toBe('signed out');
    expect(seat.withAppLogin({ login: 'unknown', isOtherAccount: false }).appLoginLabel).toBe('sign-in unknown');
  });
  test('calls it another account only while the CLI is signed in too', () => {
    const appLogin = { login: 'signedIn', isOtherAccount: true } as const;
    const signedOut = Seat.fromJSON('local', view).withStatus({ login: 'signedOut', problems: 0 });
    const signedIn = signedOut.withStatus({ login: 'signedIn', problems: 0 });
    expect(signedOut.withAppLogin(appLogin).isOtherAccount).toBe(false);
    expect(signedIn.withAppLogin(appLogin).isOtherAccount).toBe(true);
    expect(signedIn.withAppLogin(appLogin).appLoginLabel).toBe('on another account');
  });
  test('keeps the app login through a new status, and the status through a new app login', () => {
    const seat = Seat.fromJSON('local', view)
      .withAppLogin({ login: 'signedIn', isOtherAccount: false })
      .withStatus({ login: 'signedIn', identity: 'a@b', problems: 0 })
      .withProvisioned();
    expect(seat.isAppSignedIn).toBe(true);
    expect(seat.withAppLogin(undefined).identity).toBe('a@b');
  });
});

describe('Machine', () => {
  test('describes where it is', () => {
    expect(new Machine('local', 'mac', undefined, true).where).toBe('this machine');
    expect(new Machine('devbox', 'devbox', 'bee@devbox', false).where).toBe('bee@devbox');
  });
  test('can be installed when favo is missing or old', () => {
    const machine = new Machine('devbox', 'devbox', 'bee@devbox', false);
    expect(machine.canInstall).toBe(false);
    expect(machine.withPresence(MachinePresence.needsInstall).canInstall).toBe(true);
    expect(machine.withPresence(MachinePresence.outdated).canInstall).toBe(true);
  });
  test('can be read while it connects or once it is online, and not otherwise', () => {
    const machine = new Machine('devbox', 'devbox', 'bee@devbox', false);
    expect(machine.canRead).toBe(true);
    expect(machine.withPresence(MachinePresence.online).canRead).toBe(true);
    expect(machine.withPresence(MachinePresence.offline).canRead).toBe(false);
    expect(machine.withPresence(MachinePresence.outdated).canRead).toBe(false);
  });
  test('offers an update when it runs an older favo, and stays usable', () => {
    const machine = new Machine('devbox', 'devbox', 'bee@devbox', false);
    const behind = machine.withStatus({ state: 'online', version: '0.1.0', isBehind: true });
    expect(behind.isOnline).toBe(true);
    expect(behind.canUpdate).toBe(true);
    expect(behind.installLabel).toBe('update');
    expect(behind.versionLabel).toBe('older favo 0.1.0');
    expect(machine.withStatus({ state: 'online', version: '0.1.0', isBehind: false }).canUpdate).toBe(false);
    expect(machine.withPresence(MachinePresence.needsInstall).installLabel).toBe('install');
  });
});

describe('shortPath', () => {
  test('hides the home folder of either system', () => {
    expect(shortPath('/Users/bee/.claude')).toBe('~/.claude');
    expect(shortPath('/home/bee/.favo/accounts/side/codex')).toBe('~/.favo/accounts/side/codex');
    expect(shortPath('C:\\Users\\bee\\.claude')).toBe('C:\\Users\\bee\\.claude');
    expect(shortPath('/opt/other')).toBe('/opt/other');
  });
});
