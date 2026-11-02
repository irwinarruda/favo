import type { ProviderUpdateView } from '@favo/contracts/rpc/views';
import { versionFrom } from '@favo/domain/machines/machine';
import {
  canUpdateItself,
  type ProviderId,
  ProviderOrder,
  type ProviderSpec,
  Providers,
} from '@favo/domain/providers/provider';
import { ownValue } from '@favo/domain/shared/own-value';
import type { TerminalPlan } from '@favo/domain/terminal/terminal-plan';
import {
  InstallMethod,
  type InstallSource,
  installLabelOf,
  installSourceOf,
  PackageManagers,
  shimTargetOf,
  upgradeArgumentsOf,
} from '@favo/domain/updates/install-source';
import type { ProviderRunRepository } from '@/modules/providers/repositories/provider-run.repository';
import type { ProvidersService } from '@/modules/providers/services/providers.service';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';
import type { ShellEnvironment } from '@/modules/system/gateways/shell-environment';
import type { ConfigRepository } from '@/modules/system/repositories/config.repository';
import type { FavoPaths } from '@/shared/config/favo-paths';

const CheckTimeoutMs = 15_000;
const ShimHeadBytes = 4_096;

export class ProviderUpdatesService {
  constructor(
    private readonly providers: ProvidersService,
    private readonly runs: ProviderRunRepository,
    private readonly processes: ProcessRunner,
    private readonly fileSystem: FileSystem,
    private readonly shell: ShellEnvironment,
    private readonly config: ConfigRepository,
    private readonly paths: FavoPaths,
    private readonly callerEnv: Record<string, string | undefined>
  ) {}

  async list(provider?: ProviderId) {
    const chosen = ProviderOrder.filter((id) => provider === undefined || id === provider);
    const views = await Promise.all(chosen.map((id) => this.viewOf(id)));
    return views.filter((view) => view !== undefined);
  }

  async upgradeStep(source: InstallSource): Promise<TerminalPlan | undefined> {
    const manager = PackageManagers[source.method];
    const path = await this.shell.path();
    const command = this.processes.which(manager, this.ownFolders(source)) ?? this.processes.which(manager, path);
    if (!command) return undefined;
    return { command, args: upgradeArgumentsOf(source), env: await this.environmentOf(source), unsetEnv: [] };
  }

  async isPinned(source: InstallSource) {
    if (source.method !== InstallMethod.homebrew || source.isCask) return false;
    const step = await this.upgradeStep(source);
    if (!step) return false;
    const pinned = await this.processes.run({
      command: step.command,
      args: ['list', '--pinned'],
      env: step.env,
      timeoutMs: CheckTimeoutMs,
    });
    return pinned.stdout.split(/\s+/).includes(source.packageName);
  }

  private async viewOf(provider: ProviderId): Promise<ProviderUpdateView | undefined> {
    const binary = await this.providers.binaryOf(provider);
    if (!binary) return undefined;
    const spec = Providers[provider];
    const realPath = await this.fileSystem.realPath(binary);
    const source = await this.sourceFor(spec, realPath);
    const env = await this.environmentOf(source);
    const check = await this.processes.run({ command: binary, args: ['--version'], env, timeoutMs: CheckTimeoutMs });
    return {
      provider,
      label: spec.label,
      version: versionFrom(check.stdout),
      installedWith: source ? installLabelOf(source) : `own install at ${realPath}`,
      otherCopies: await this.otherCopies(spec.executable, realPath),
      runningAccounts: await this.runningNames(provider),
      heldBack: await this.heldBack(provider, source),
      steps: await this.stepsOf(spec, binary, source),
    };
  }

  private async sourceFor(spec: ProviderSpec, realPath: string) {
    const head = await this.fileSystem.readHead(realPath, ShimHeadBytes);
    const source = installSourceOf(realPath) ?? installSourceOf(shimTargetOf(realPath, head ?? '') ?? '');
    return source && spec.update.packages.includes(source.packageName) ? source : undefined;
  }

  private async runningNames(provider: ProviderId) {
    const names = await this.config.accountNames();
    return (await this.runs.accountsRunning(provider)).map((account) => ownValue(names, account) ?? account);
  }

  private async heldBack(provider: ProviderId, source?: InstallSource) {
    const { home, configHome } = this.paths;
    const search = { env: { ...this.callerEnv, ...(await this.shell.variables()) }, home, configHome };
    const off = await this.providers.cliOf(provider).updateSwitch(search, this.fileSystem);
    if (off) return `its updates are turned off by ${off}`;
    return source && (await this.isPinned(source)) ? 'it is pinned in Homebrew' : undefined;
  }

  private async stepsOf(spec: ProviderSpec, binary: string, source?: InstallSource) {
    const args = spec.update.arguments ?? [];
    const own = { command: binary, args, env: await this.environmentOf(source), unsetEnv: [] };
    const manager = source ? await this.upgradeStep(source) : undefined;
    return [...(canUpdateItself(spec, source) ? [own] : []), ...(manager ? [manager] : [])];
  }

  private async otherCopies(executable: string, realPath: string) {
    const copies = new Map<string, string>([[realPath, '']]);
    const folders = (await this.shell.path()).split(this.delimiter).filter(Boolean);
    for (const found of folders.map((folder) => this.processes.which(executable, folder))) {
      if (!found) continue;
      const real = await this.fileSystem.realPath(found);
      if (!copies.has(real)) copies.set(real, found);
    }
    return [...copies.values()].filter(Boolean);
  }

  private async environmentOf(source?: InstallSource) {
    const path = await this.shell.path();
    return { PATH: source ? [this.ownFolders(source), path].join(this.delimiter) : path };
  }

  private ownFolders({ root }: InstallSource) {
    return [`${root}/bin`, root].join(this.delimiter);
  }

  private get delimiter() {
    return this.paths.isWindows ? ';' : ':';
  }
}
