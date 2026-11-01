import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';
import { AccountView } from '#contracts/rpc/views';

export const listAccounts = defineMethod({
  name: 'accounts.list',
  routing: MethodRouting.machine,
  params: z.strictObject({}),
  result: z.array(AccountView),
});
