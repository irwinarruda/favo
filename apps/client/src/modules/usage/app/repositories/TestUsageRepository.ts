import { ownValue } from '@favo/domain/shared/own-value';
import { mockDb } from '@/__tests__/db';
import type { IUsageRepository } from '@/modules/usage/app/repositories/IUsageRepository';

export class TestUsageRepository implements IUsageRepository {
  async readMachine(machineId: string) {
    mockDb.usageReads.push(machineId);
    const failure = ownValue(mockDb.usageFailures, machineId);
    if (failure) throw failure;
    return ownValue(mockDb.seatUsage, machineId) ?? [];
  }
}
