import { describe, expect, it } from 'bun:test';
import {
  assertMachineName,
  assertMachineTarget,
  assetNameFor,
  isOlderVersion,
  machineNameFromTarget,
} from '#domain/machines/machine';

describe('machines', () => {
  it('names a machine after its host', () => {
    expect(machineNameFromTarget('bee@devbox')).toBe('devbox');
    expect(machineNameFromTarget('MacMini.tail1234.ts.net')).toBe('macmini');
  });
  it('keeps local for this machine', () => {
    expect(() => assertMachineName('local')).toThrow();
    expect(() => assertMachineName('devbox')).not.toThrow();
  });
  it('refuses a target that could become an ssh flag', () => {
    expect(() => assertMachineTarget('-oProxyCommand=x')).toThrow();
    expect(() => assertMachineTarget('a b')).toThrow();
    expect(() => assertMachineTarget('bee@devbox')).not.toThrow();
  });
  it('says which target is wrong when it has one to name', () => {
    expect(() => assertMachineTarget('-x', 'The target of "box"')).toThrow(
      'The target of "box" must look like user@host.'
    );
  });
  it('tells an older favo from the same or a newer one', () => {
    expect(isOlderVersion('0.1.1', '0.1.2')).toBe(true);
    expect(isOlderVersion('0.9.0', '0.10.0')).toBe(true);
    expect(isOlderVersion('0.1.2', '0.1.2')).toBe(false);
    expect(isOlderVersion('0.2.0', '0.1.9')).toBe(false);
  });
  it('picks the binary a machine can run', () => {
    expect(assetNameFor('Linux x86_64')).toBe('favo-linux-x64');
    expect(assetNameFor('Linux aarch64')).toBe('favo-linux-arm64');
    expect(assetNameFor('Darwin arm64\n')).toBe('favo-darwin-arm64');
    expect(() => assetNameFor('FreeBSD amd64')).toThrow('does not run');
  });
  it('quotes what a machine reports about itself without its escape sequences', () => {
    expect(() => assetNameFor('\u001b]0;pwned\u0007Evil\u009b2J\n')).toThrow('favo does not run on "]0;pwnedEvil2J".');
  });
});
