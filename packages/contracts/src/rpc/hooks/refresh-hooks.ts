import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const refreshHooks = defineMethod({
  name: 'hooks.refresh',
  routing: MethodRouting.machine,
  params: z.strictObject({}),
  result: z.strictObject({}),
});
