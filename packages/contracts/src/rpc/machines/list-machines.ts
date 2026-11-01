import { Machine } from '@favo/domain/machines/machine';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const listMachines = defineMethod({
  name: 'machines.list',
  routing: MethodRouting.hub,
  params: z.strictObject({}),
  result: z.array(Machine),
});
