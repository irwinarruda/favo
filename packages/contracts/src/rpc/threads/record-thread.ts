import { ProviderId } from '@favo/domain/providers/provider';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const RecordThreadParams = z.strictObject({
  provider: z.enum(ProviderId),
  id: z.string(),
  directory: z.string(),
  transcript: z.string().optional(),
  isFresh: z.boolean(),
  ownerProcess: z.string().optional(),
});
export type RecordThreadParams = z.infer<typeof RecordThreadParams>;

export const recordThread = defineMethod({
  name: 'threads.record',
  routing: MethodRouting.hub,
  params: RecordThreadParams,
  result: z.strictObject({ isRecorded: z.boolean() }),
});
