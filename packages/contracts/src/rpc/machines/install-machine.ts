import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const installMachine = defineMethod({
  name: 'machines.install',
  routing: MethodRouting.hub,
  params: z.strictObject({ id: z.string() }),
  result: z.strictObject({ version: z.string() }),
});
