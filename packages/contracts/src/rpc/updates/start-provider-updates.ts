import { ProviderId } from '@favo/domain/providers/provider';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const StartProviderUpdatesParams = z.strictObject({
  providers: z.array(z.enum(ProviderId)).optional(),
  isRunningIncluded: z.boolean().optional(),
});
export type StartProviderUpdatesParams = z.infer<typeof StartProviderUpdatesParams>;

export const StartedUpdate = z.strictObject({ provider: z.enum(ProviderId), version: z.string().optional() });
export type StartedUpdate = z.infer<typeof StartedUpdate>;

export const startProviderUpdates = defineMethod({
  name: 'updates.start',
  routing: MethodRouting.machine,
  params: StartProviderUpdatesParams,
  result: z.strictObject({ started: z.array(StartedUpdate) }),
});
