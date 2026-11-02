import type { ProviderId } from '@favo/domain/providers/provider';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';
import type { FavoPaths } from '@/shared/config/favo-paths';

export class ProviderRunRepository {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly processes: ProcessRunner,
    private readonly paths: FavoPaths
  ) {}

  pidFile(account: string, provider: ProviderId, launchId: string) {
    return `${this.paths.running}/${account}/${provider}/${launchId}`;
  }

  async accountsRunning(provider: ProviderId) {
    const accounts = await this.fileSystem.list(this.paths.running);
    const running = await Promise.all(accounts.map((account) => this.isRunning(account, provider)));
    return accounts.filter((_, index) => running[index]);
  }

  private async isRunning(account: string, provider: ProviderId) {
    const folder = `${this.paths.running}/${account}/${provider}`;
    let isRunning = false;
    for (const launch of await this.fileSystem.list(folder)) {
      const pid = Number(await this.fileSystem.readText(`${folder}/${launch}`));
      if (pid > 0 && this.processes.isAlive(pid)) isRunning = true;
      else await this.fileSystem.unlink(`${folder}/${launch}`);
    }
    return isRunning;
  }
}
