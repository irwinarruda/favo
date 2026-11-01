import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';
import { AccountView } from '#contracts/rpc/views';

export const renameAccount = defineMethod({
  name: 'accounts.rename',
  routing: MethodRouting.machine,
  params: z.strictObject({ name: z.string(), newName: z.string() }),
  result: AccountView,
});
