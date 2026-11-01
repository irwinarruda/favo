import { mainProcessIds } from '@favo/domain/desktop/desktop-app';
import { assertDomain, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { DesktopApps, type InstalledDesktopApp } from '@/modules/desktop/gateways/desktop-apps';
import { waitUntil } from '@/modules/desktop/utils/wait-until';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';

const QuitTimeoutMs = 10_000;
export const CommandTimeoutMs = 10_000;

export abstract class UnixDesktopApps extends DesktopApps {
  constructor(
    protected readonly processes: ProcessRunner,
    private readonly quitTimeoutMs = QuitTimeoutMs
  ) {
    super();
  }

  async isRunning(app: InstalledDesktopApp) {
    return (await this.mainProcesses(app)).length > 0;
  }

  async quit(app: InstalledDesktopApp) {
    const ids = await this.mainProcesses(app);
    if (ids.length > 0) await this.processes.run({ command: 'kill', args: ['-TERM', ...ids.map(String)] });
    return waitUntil(async () => !(await this.isRunning(app)), this.quitTimeoutMs);
  }

  private async mainProcesses(app: InstalledDesktopApp) {
    const { code, stdout } = await this.processes.run({
      command: 'ps',
      args: ['x', '-o', 'pid=,args='],
      timeoutMs: CommandTimeoutMs,
    });
    assertDomain(code === 0, DomainErrorCode.desktopAppFailed, `Could not tell whether ${app.spec.label} is open.`);
    return mainProcessIds(stdout, app.executables);
  }
}
