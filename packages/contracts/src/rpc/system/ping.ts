import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const PingResult = z.strictObject({
  version: z.string(),
  protocol: z.number(),
  hostname: z.string(),
  platform: z.string(),
  arch: z.string(),
  home: z.string(),
  directory: z.string(),
});
export type PingResult = z.infer<typeof PingResult>;

export const ping = defineMethod({
  name: 'system.ping',
  routing: MethodRouting.machine,
  params: z.strictObject({}),
  result: PingResult,
});
