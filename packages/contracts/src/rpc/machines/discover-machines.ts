import { DiscoverySource } from '@favo/domain/machines/machine';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const DiscoveredMachine = z.strictObject({
  name: z.string(),
  target: z.string(),
  source: z.enum(DiscoverySource),
  isOnline: z.boolean().optional(),
});
export type DiscoveredMachine = z.infer<typeof DiscoveredMachine>;

export const discoverMachines = defineMethod({
  name: 'machines.discover',
  routing: MethodRouting.hub,
  params: z.strictObject({}),
  result: z.array(DiscoveredMachine),
});
