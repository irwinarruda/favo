import { ownValue } from '@favo/domain/shared/own-value';
import { mockDb } from '@/__tests__/db';
import type { Seat } from '@/modules/comb/app/entities/Seat';
import type { IThreadRepository } from '@/modules/threads/app/repositories/IThreadRepository';

export class TestThreadRepository implements IThreadRepository {
  async getThreads(seat: Seat) {
    const failure = ownValue(mockDb.threadFailures, seat.machineId);
    if (failure) throw failure;
    return ownValue(mockDb.threads, seat.key) ?? [];
  }

  async getHooks(machineId: string) {
    const failure = ownValue(mockDb.threadFailures, machineId);
    if (failure) throw failure;
    return ownValue(mockDb.hooks, machineId) ?? [];
  }

  async installHooks(machineId: string) {
    const hooks = (ownValue(mockDb.hooks, machineId) ?? []).map((hook) => ({
      ...hook,
      state: hook.isProviderInstalled ? ('current' as const) : hook.state,
    }));
    mockDb.hooks = { ...mockDb.hooks, [machineId]: hooks };
    return hooks;
  }
}
