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
});

describe('shortPath', () => {
  test('hides the home folder of either system', () => {
    expect(shortPath('/Users/bee/.claude')).toBe('~/.claude');
    expect(shortPath('/home/bee/.favo/accounts/side/codex')).toBe('~/.favo/accounts/side/codex');
    expect(shortPath('C:\\Users\\bee\\.claude')).toBe('C:\\Users\\bee\\.claude');
    expect(shortPath('/opt/other')).toBe('/opt/other');
  });
});
