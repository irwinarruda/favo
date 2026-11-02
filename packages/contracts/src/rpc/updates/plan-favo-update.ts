import { TerminalPlan } from '@favo/domain/terminal/terminal-plan';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const FavoUpdatePlan = z.strictObject({
  version: z.string(),
  installedWith: z.string().optional(),
  heldBack: z.string().optional(),
  upgrade: TerminalPlan.optional(),
  restart: TerminalPlan.optional(),
});
export type FavoUpdatePlan = z.infer<typeof FavoUpdatePlan>;

export const planFavoUpdate = defineMethod({
  name: 'updates.planFavo',
  routing: MethodRouting.hub,
  params: z.strictObject({}),
  result: FavoUpdatePlan,
});
