import { machineNameFromTarget } from '@favo/domain/machines/machine';
import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { ownValue } from '@favo/domain/shared/own-value';
import { mockDb } from '@/__tests__/db';
import type { IMachineRepository } from '@/modules/machines/app/repositories/IMachineRepository';

export class TestMachineRepository implements IMachineRepository {
  async discover() {
    return mockDb.discovered;
  }

  async add(target: string) {
    if (mockDb.unreachableTargets.includes(target)) {
      throw new DomainError(DomainErrorCode.machineUnreachable, `${target}: connection refused`);
    }
    const name = machineNameFromTarget(target);
    mockDb.machines.push({ id: name, name, target, isLocal: false });
    mockDb.machineStatuses[name] = { state: 'needsInstall', message: `favo is not installed on ${name} yet.` };
    return { id: name, name };
  }

  async remove(id: string) {
    mockDb.machines = mockDb.machines.filter((machine) => machine.id !== id);
  }

  async install(id: string) {
    const failure = ownValue(mockDb.installFailures, id);
    if (failure) throw failure;
    mockDb.installed.push(id);
    mockDb.machineStatuses[id] = { state: 'online' };
    return '0.1.0';
  }
}
