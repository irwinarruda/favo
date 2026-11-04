import { ownValue } from '@favo/domain/shared/own-value';
import { mockDb } from '@/__tests__/db';
import type { IProviderCliRepository } from '@/modules/updates/app/repositories/IProviderCliRepository';

export class TestProviderCliRepository implements IProviderCliRepository {
  async readMachine(machineId: string) {
    mockDb.providerVersionReads.push(machineId);
    await mockDb.providerVersionHold;
    const failure = ownValue(mockDb.providerVersionFailures, machineId);
    if (failure) throw failure;
    return ownValue(mockDb.providerVersions, machineId) ?? [];
  }
}
