import type { HookView, ThreadView } from '@favo/contracts/rpc/views';
import type { Seat } from '@/modules/comb/app/entities/Seat';

export type IThreadRepository = {
  getThreads(seat: Seat, directory?: string): Promise<ThreadView[]>;
  getHooks(machineId: string): Promise<HookView[]>;
  installHooks(machineId: string): Promise<HookView[]>;
};
