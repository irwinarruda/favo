import { MachineState } from '@favo/domain/machines/machine';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const MachineStatus = z.strictObject({
  state: z.enum(MachineState),
  version: z.string().optional(),
  hostname: z.string().optional(),
  directory: z.string().optional(),
  message: z.string().optional(),
});
export type MachineStatus = z.infer<typeof MachineStatus>;

export const getMachineStatus = defineMethod({
  name: 'machines.status',
  routing: MethodRouting.hub,
  params: z.strictObject({ id: z.string() }),
  result: MachineStatus,
});
