import { ProviderId } from '@favo/domain/providers/provider';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';
import { AccountView } from '#contracts/rpc/views';

export const adoptAccount = defineMethod({
  name: 'accounts.adopt',
  routing: MethodRouting.machine,
  params: z.strictObject({ name: z.string(), provider: z.enum(ProviderId), from: z.string() }),
  result: AccountView,
});
