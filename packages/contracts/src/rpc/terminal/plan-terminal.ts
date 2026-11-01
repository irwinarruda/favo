import { ProviderId } from '@favo/domain/providers/provider';
import { TerminalAction, TerminalPlan } from '@favo/domain/terminal/terminal-plan';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const PlanTerminalParams = z.strictObject({
  machineId: z.string().optional(),
  action: z.enum(TerminalAction),
  account: z.string(),
  provider: z.enum(ProviderId),
  args: z.array(z.string()),
  directory: z.string().optional(),
});
export type PlanTerminalParams = z.infer<typeof PlanTerminalParams>;

export const planTerminal = defineMethod({
  name: 'terminal.plan',
  routing: MethodRouting.hub,
  params: PlanTerminalParams,
  result: TerminalPlan,
});
