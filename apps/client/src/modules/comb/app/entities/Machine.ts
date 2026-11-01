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
    readonly directory?: string
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

  get canInstall() {
    return this.presence === MachinePresence.needsInstall || this.presence === MachinePresence.outdated;
  }

  get presenceLabel() {
    if (this.presence === MachinePresence.needsInstall) return 'favo not installed';
    if (this.presence === MachinePresence.outdated) return 'older favo';
    return this.presence;
  }

  withPresence(presence: MachinePresence, message?: string) {
    return new Machine(this.id, this.name, this.target, this.isLocal, presence, message, this.directory);
  }

  withStatus(status: MachineStatus) {
    const directory = status.directory ?? this.directory;
    return new Machine(this.id, this.name, this.target, this.isLocal, status.state, status.message, directory);
  }
}
