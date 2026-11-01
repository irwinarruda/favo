import type { ValueOf } from '@favo/domain/shared/value-of';

export const MachinePresence = {
  connecting: 'connecting',
  online: 'online',
  offline: 'offline',
  needsInstall: 'needsInstall',
  outdated: 'outdated',
  installing: 'installing',
} as const;
export type MachinePresence = ValueOf<typeof MachinePresence>;
