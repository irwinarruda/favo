import { Machine } from '@favo/domain/machines/machine';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const addMachine = defineMethod({
  name: 'machines.add',
  routing: MethodRouting.hub,
  params: z.strictObject({ target: z.string(), name: z.string().optional() }),
  result: Machine,
});
