import type { MachineStatus } from '@favo/contracts/rpc/machines/get-machine-status';
import type { Machine as MachineJSON } from '@favo/domain/machines/machine';
import { MachinePresence } from '@/modules/comb/app/enums/MachinePresence';

export class Machine {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly target: string | undefined,
    readonly isLocal: boolean,
    readonly presence: MachinePresence = MachinePresence.connecting,
    readonly message?: string,
    readonly directory?: string,
    readonly version?: string,
    readonly isBehind = false
  ) {}

  static fromJSON(json: MachineJSON) {
    return new Machine(json.id, json.name, json.target, json.isLocal);
  }

  get where() {
    return this.isLocal ? 'this machine' : (this.target ?? '');
  }

  get isOnline() {
    return this.presence === MachinePresence.online;
  }

  get canUpdate() {
    return this.presence === MachinePresence.outdated || (this.isOnline && this.isBehind);
  }

  get canInstall() {
    return this.presence === MachinePresence.needsInstall || this.canUpdate;
  }

  get installLabel() {
    return this.presence === MachinePresence.needsInstall ? 'install' : 'update';
  }

  get versionLabel() {
    return this.isOnline && this.isBehind ? `older favo ${this.version}` : undefined;
  }

  get presenceLabel() {
    if (this.presence === MachinePresence.needsInstall) return 'favo not installed';
    if (this.presence === MachinePresence.outdated) return 'older favo';
    return this.presence;
  }

  withPresence(presence: MachinePresence, message?: string) {
    const { id, name, target, isLocal, directory, version, isBehind } = this;
    return new Machine(id, name, target, isLocal, presence, message, directory, version, isBehind);
  }

  withStatus(status: MachineStatus) {
    const directory = status.directory ?? this.directory;
    const { id, name, target, isLocal } = this;
    const isBehind = status.isBehind ?? false;
    return new Machine(id, name, target, isLocal, status.state, status.message, directory, status.version, isBehind);
  }
}
