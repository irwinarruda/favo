import { type HerdrPane, type HerdrReport, herdrReportArguments } from '@favo/domain/terminal/herdr';
import { Herdr, HerdrAnswer } from '@/modules/herdr/gateways/herdr';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';

const ReportTimeoutMs = 1_000;
const NotAcceptedCode = 'resume_not_accepted';

export class CliHerdr extends Herdr {
  constructor(private readonly processes: ProcessRunner) {
    super();
  }

  async report(pane: HerdrPane, report: HerdrReport) {
    const { code, stdout, stderr } = await this.processes.run({
      command: pane.binary,
      args: herdrReportArguments(pane, report),
      timeoutMs: ReportTimeoutMs,
    });
    if (code === 0) return HerdrAnswer.accepted;
    return `${stdout}${stderr}`.includes(NotAcceptedCode) ? HerdrAnswer.tooEarly : HerdrAnswer.failed;
  }
}
