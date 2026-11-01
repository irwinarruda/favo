import type { TerminalPlan } from '@favo/domain/terminal/terminal-plan';

export type ITerminalGateway = {
  run(plan: TerminalPlan): Promise<number>;
};
