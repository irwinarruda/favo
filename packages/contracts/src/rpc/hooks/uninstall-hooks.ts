import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';
import { HookView } from '#contracts/rpc/views';

export const uninstallHooks = defineMethod({
  name: 'hooks.uninstall',
  routing: MethodRouting.machine,
  params: z.strictObject({}),
  result: z.array(HookView),
});
