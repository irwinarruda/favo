import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const removeMachine = defineMethod({
  name: 'machines.remove',
  routing: MethodRouting.hub,
  params: z.strictObject({ id: z.string() }),
  result: z.strictObject({}),
});
