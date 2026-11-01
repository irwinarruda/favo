import type { TerminalPlan } from '@favo/domain/terminal/terminal-plan';
import type { ITerminalGateway } from '@/shared/app/gateways/ITerminalGateway';

type SuspendableRenderer = { suspend(): Promise<void>; resume(): Promise<void> };

export class RendererTerminalGateway implements ITerminalGateway {
  constructor(
    private readonly renderer: SuspendableRenderer,
    private readonly runPlan: (plan: TerminalPlan) => Promise<number>
  ) {}

  async run(plan: TerminalPlan) {
    try {
      await this.renderer.suspend();
      return await this.runPlan(plan);
    } finally {
      await this.renderer.resume();
    }
  }
}
