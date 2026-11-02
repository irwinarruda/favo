import { TerminalPlan } from '@favo/domain/terminal/terminal-plan';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const PlanUpdateParams = z.strictObject({
  machineId: z.string().optional(),
  isHeld: z.boolean().optional(),
});
export type PlanUpdateParams = z.infer<typeof PlanUpdateParams>;

export const planUpdate = defineMethod({
  name: 'updates.plan',
  routing: MethodRouting.hub,
  params: PlanUpdateParams,
  result: TerminalPlan,
});
