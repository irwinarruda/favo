import { ProviderId } from '@favo/domain/providers/provider';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';
import { ProviderUpdateView } from '#contracts/rpc/views';

export const listProviderUpdates = defineMethod({
  name: 'updates.listProviders',
  routing: MethodRouting.machine,
  params: z.strictObject({ provider: z.enum(ProviderId).optional() }),
  result: z.array(ProviderUpdateView),
});
