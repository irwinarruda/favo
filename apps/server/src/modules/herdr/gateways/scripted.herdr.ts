import type { HerdrPane, HerdrReport } from '@favo/domain/terminal/herdr';
import { Herdr, HerdrAnswer } from '@/modules/herdr/gateways/herdr';

export class ScriptedHerdr extends Herdr {
  readonly reports: (HerdrReport & { pane: HerdrPane })[] = [];
  readonly answers: HerdrAnswer[] = [];

  async report(pane: HerdrPane, report: HerdrReport) {
    this.reports.push({ ...report, pane });
    return this.answers.shift() ?? HerdrAnswer.accepted;
  }
}
