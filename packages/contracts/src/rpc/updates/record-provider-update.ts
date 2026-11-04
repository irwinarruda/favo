import { ProviderId } from '@favo/domain/providers/provider';
import { UpdateOutcome } from '@favo/domain/updates/update-outcome';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const recordProviderUpdate = defineMethod({
  name: 'updates.record',
  routing: MethodRouting.hub,
  params: z.strictObject({ provider: z.enum(ProviderId), outcome: UpdateOutcome.optional() }),
  result: z.strictObject({}),
});
