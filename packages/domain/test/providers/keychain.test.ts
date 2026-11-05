import { describe, expect, it } from 'bun:test';
import { isKeychainSkipped, type KeychainFacts, sessionBusOf } from '#domain/providers/keychain';
import { LoginScope, loginScopeOf, Providers } from '#domain/providers/provider';

const desktop: KeychainFacts = { env: {}, isLinux: false, hasDockerEnv: false, hasBusSocket: false };
const linuxDesktop: KeychainFacts = {
  ...desktop,
  isLinux: true,
  env: { DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus' },
  osRelease: '6.8.0-45-generic\n',
  cgroup: '0::/init.scope\n',
};

describe('where agy keeps its login', () => {
  it('is the system keychain on a Mac or Windows desktop', () => {
    expect(isKeychainSkipped(desktop)).toBe(false);
  });
  it('is the system keychain in a Linux desktop session', () => {
    expect(isKeychainSkipped(linuxDesktop)).toBe(false);
  });
  it('is a file in the cell over SSH, as on every remote machine', () => {
    for (const name of ['SSH_TTY', 'SSH_CLIENT', 'SSH_CONNECTION']) {
      expect(isKeychainSkipped({ ...desktop, env: { [name]: '10.0.0.2 51000 10.0.0.3 22' } })).toBe(true);
    }
  });
  it('is a file in the cell under WSL, told by its variables or by the kernel', () => {
    expect(isKeychainSkipped({ ...linuxDesktop, env: { WSL_DISTRO_NAME: 'Ubuntu' } })).toBe(true);
    expect(isKeychainSkipped({ ...linuxDesktop, env: { WSL_INTEROP: '/run/WSL/1_interop' } })).toBe(true);
    expect(isKeychainSkipped({ ...linuxDesktop, osRelease: '6.6.87.2-microsoft-standard-WSL2\n' })).toBe(true);
  });
  it('is a file in the cell inside a container', () => {
    expect(isKeychainSkipped({ ...linuxDesktop, hasDockerEnv: true })).toBe(true);
    expect(isKeychainSkipped({ ...linuxDesktop, cgroup: '0::/kubepods/besteffort/pod1\n' })).toBe(true);
  });
  it('is a file in the cell on Linux with no session bus to reach a keychain through', () => {
    expect(isKeychainSkipped({ ...linuxDesktop, env: {} })).toBe(true);
    expect(isKeychainSkipped({ ...linuxDesktop, env: { DBUS_SESSION_BUS_ADDRESS: 'disabled:' } })).toBe(true);
    expect(isKeychainSkipped({ ...linuxDesktop, env: {}, hasBusSocket: true })).toBe(false);
  });
  it('looks for the session bus where agy does: the runtime folder, else the one named after the user', () => {
    expect(sessionBusOf({ XDG_RUNTIME_DIR: '/run/user/1000' }, 1000)).toBe('/run/user/1000/bus');
    expect(sessionBusOf({ XDG_RUNTIME_DIR: '/tmp/runtime' }, 1000)).toBe('/tmp/runtime/bus');
    expect(sessionBusOf({ XDG_RUNTIME_DIR: '' }, 1000)).toBe('/run/user/1000/bus');
    expect(sessionBusOf({}, 1000)).toBe('/run/user/1000/bus');
    expect(sessionBusOf({})).toBeUndefined();
  });
  it('ignores Linux files on a Mac or Windows, where agy never looks for a session bus', () => {
    expect(isKeychainSkipped({ ...desktop, osRelease: 'microsoft', hasDockerEnv: true })).toBe(false);
  });
});

describe('the login scope of a seat', () => {
  it('is the whole computer for Antigravity where agy uses the keychain, whose entry ignores HOME', () => {
    expect(loginScopeOf(Providers.antigravity, false)).toBe(LoginScope.perComputer);
  });
  it('is each account for Antigravity where agy keeps the login in a file in the cell', () => {
    expect(loginScopeOf(Providers.antigravity, true)).toBe(LoginScope.perAccount);
  });
  it('is each account for every other provider, wherever it runs', () => {
    for (const spec of [Providers.claude, Providers.codex, Providers.opencode]) {
      expect(loginScopeOf(spec, false)).toBe(LoginScope.perAccount);
      expect(loginScopeOf(spec, true)).toBe(LoginScope.perAccount);
    }
  });
});
