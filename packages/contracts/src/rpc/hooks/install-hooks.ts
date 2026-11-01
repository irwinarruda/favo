import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';
import { HookView } from '#contracts/rpc/views';

export const installHooks = defineMethod({
  name: 'hooks.install',
  routing: MethodRouting.machine,
  params: z.strictObject({}),
  result: z.array(HookView),
});
