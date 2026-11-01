import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';
import { AccountView } from '#contracts/rpc/views';

export const createAccount = defineMethod({
  name: 'accounts.create',
  routing: MethodRouting.machine,
  params: z.strictObject({ name: z.string() }),
  result: AccountView,
});
