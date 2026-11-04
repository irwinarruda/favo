import { ProviderId } from '@favo/domain/providers/provider';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';
import { ProviderVersionView } from '#contracts/rpc/views';

export const listProviderVersions = defineMethod({
  name: 'updates.listVersions',
  routing: MethodRouting.machine,
  params: z.strictObject({ provider: z.enum(ProviderId).optional() }),
  result: z.array(ProviderVersionView),
});
