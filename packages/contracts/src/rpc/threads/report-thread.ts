import { ProviderId } from '@favo/domain/providers/provider';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const reportThread = defineMethod({
  name: 'threads.report',
  routing: MethodRouting.hub,
  params: z.strictObject({ provider: z.enum(ProviderId), id: z.string() }),
  result: z.strictObject({}),
});
