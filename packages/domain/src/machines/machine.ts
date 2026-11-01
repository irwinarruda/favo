import { z } from 'zod';
import { stripControlCharacters } from '#domain/shared/control-characters';
import { assertDomain, DomainError, DomainErrorCode } from '#domain/shared/domain-error';
import type { ValueOf } from '#domain/shared/value-of';

export const LocalMachineId = 'local';
export const WindowsAsset = 'favo-windows-x64.exe';

export const RemoteSystem = {
  posix: 'posix',
  windows: 'windows',
} as const;
export type RemoteSystem = ValueOf<typeof RemoteSystem>;

export const Machine = z.strictObject({
  id: z.string(),
  name: z.string(),
  target: z.string().optional(),
  isLocal: z.boolean(),
  system: z.enum(RemoteSystem).optional(),
});
export type Machine = z.infer<typeof Machine>;

export const MachineState = {
  online: 'online',
  offline: 'offline',
  needsInstall: 'needsInstall',
  outdated: 'outdated',
} as const;
export type MachineState = ValueOf<typeof MachineState>;

export const DiscoverySource = {
  sshConfig: 'sshConfig',
  tailscale: 'tailscale',
} as const;
export type DiscoverySource = ValueOf<typeof DiscoverySource>;

const MachineNamePattern = /^[a-z0-9][a-z0-9-]{0,62}$/;
const SshTargetPattern = /^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9._-]+$/;

export function remoteBinaryOf(system: RemoteSystem = RemoteSystem.posix) {
  return system === RemoteSystem.windows ? '.favo\\bin\\favo.exe' : '~/.favo/bin/favo';
}

export function versionFrom(output: string) {
  return /\b\d+\.\d+\.\d+\b/.exec(output)?.[0];
}

export function isOlderVersion(version: string, than: string) {
  const parts = version.split('.').map(Number);
  const others = than.split('.').map(Number);
  const index = parts.findIndex((part, position) => part !== others[position]);
  return index !== -1 && parts[index]! < others[index]!;
}

export function assertMachineName(name: string) {
  assertDomain(
    MachineNamePattern.test(name),
    DomainErrorCode.invalidMachineName,
    'A machine name uses lowercase letters, numbers and dashes.'
  );
  assertDomain(name !== LocalMachineId, DomainErrorCode.invalidMachineName, '"local" always means this machine.');
}

export function assertMachineTarget(target: string, subject = 'A machine target') {
  assertDomain(
    SshTargetPattern.test(target) && !target.startsWith('-'),
    DomainErrorCode.invalidMachineTarget,
    `${subject} must look like user@host.`
  );
}

export function machineNameFromTarget(target: string) {
  const host = target.split('@').at(-1)!;
  return host.split('.')[0]!.toLowerCase();
}

export function assetNameFor(uname: string) {
  const [system, machine] = uname.trim().split(/\s+/);
  const os = system === 'Darwin' ? 'darwin' : system === 'Linux' ? 'linux' : undefined;
  const arch = machine === 'arm64' || machine === 'aarch64' ? 'arm64' : machine === 'x86_64' ? 'x64' : undefined;
  if (!os || !arch) {
    const reported = stripControlCharacters(uname.trim());
    throw new DomainError(DomainErrorCode.unsupportedPlatform, `favo does not run on "${reported}".`);
  }
  return `favo-${os}-${arch}`;
}
