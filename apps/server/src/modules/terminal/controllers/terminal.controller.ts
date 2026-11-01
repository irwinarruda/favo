import { planTerminal } from '@favo/contracts/rpc/terminal/plan-terminal';
import type { TerminalService } from '@/modules/terminal/services/terminal.service';
import type { RpcRouter } from '@/shared/rpc/rpc-router';

export function registerTerminalController(router: RpcRouter, terminal: TerminalService) {
  router.handle(planTerminal, (params) => terminal.plan(params));
}
