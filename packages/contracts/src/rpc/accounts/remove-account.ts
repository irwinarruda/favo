import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const removeAccount = defineMethod({
  name: 'accounts.remove',
  routing: MethodRouting.machine,
  params: z.strictObject({ name: z.string() }),
  result: z.strictObject({ trashedTo: z.string() }),
});
