import { ProviderId } from '@favo/domain/providers/provider';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';
import { ThreadView } from '#contracts/rpc/views';

export const ListThreadsParams = z.strictObject({
  account: z.string(),
  provider: z.enum(ProviderId),
  directory: z.string().optional(),
});
export type ListThreadsParams = z.infer<typeof ListThreadsParams>;

export const listThreads = defineMethod({
  name: 'threads.list',
  routing: MethodRouting.machine,
  params: ListThreadsParams,
  result: z.array(ThreadView),
});
