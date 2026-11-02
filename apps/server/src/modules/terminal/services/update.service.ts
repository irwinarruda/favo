import type { FavoUpdatePlan } from '@favo/contracts/rpc/updates/plan-favo-update';
import type { PlanUpdateParams } from '@favo/contracts/rpc/updates/plan-update';
import { LocalMachineId, MachineState } from '@favo/domain/machines/machine';
import { assertDomain, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { remoteTerminalPlan, updateArgumentsFor } from '@favo/domain/terminal/terminal-plan';
import { FavoPackage, installLabelOf, installSourceOf } from '@favo/domain/updates/install-source';
import type { MachinesService } from '@/modules/machines/services/machines.service';
import type { ProviderUpdatesService } from '@/modules/providers/services/provider-updates.service';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { FavoPaths } from '@/shared/config/favo-paths';

const FavoCommand = 'favo';

export class UpdateService {
  constructor(
    private readonly providerUpdates: ProviderUpdatesService,
    private readonly machines: MachinesService,
    private readonly fileSystem: FileSystem,
    private readonly paths: FavoPaths,
    private readonly callerEnv: Record<string, string | undefined>,
    private readonly version: string,
    private readonly binary?: string
  ) {}

  async planFavo(): Promise<FavoUpdatePlan> {
    const { version } = this;
    const install = await this.installOf();
    if (!install) return { version };
    const { source, restart } = install;
    const installedWith = installLabelOf(source);
    if (await this.providerUpdates.isPinned(source)) {
      return { version, installedWith, heldBack: 'it is pinned in Homebrew' };
    }
    return { version, installedWith, upgrade: await this.providerUpdates.upgradeStep(source), restart };
  }

  async planOn({ machineId, isHeld }: PlanUpdateParams) {
    const args = updateArgumentsFor({ isHereOnly: true, isHeld });
    if (machineId === undefined || machineId === LocalMachineId) return this.planOf(this.binary ?? FavoCommand, args);
    const machine = await this.machines.requireRemote(machineId);
    const { state, isBehind } = await this.machines.status(machine.id);
    assertDomain(
      state !== MachineState.outdated && !isBehind,
      DomainErrorCode.machineOutdated,
      `${machine.name} runs an older favo. To update it: favo machine install ${machine.name}`
    );
    assertDomain(state === MachineState.online, DomainErrorCode.machineUnreachable, `Could not reach ${machine.name}.`);
    return remoteTerminalPlan(machine.target!, machine.system, args);
  }

  private async installOf() {
    if (!this.binary) return undefined;
    const realPath = await this.fileSystem.realPath(this.binary);
    const runtime = await this.fileSystem.realPath(this.paths.runtime);
    if (realPath.replaceAll('\\', '/').startsWith(`${runtime.replaceAll('\\', '/')}/`)) return this.launcherInstall();
    const source = this.favoSourceOf(realPath);
    return source && { source, restart: this.planOf(`${source.root}/bin/${FavoCommand}`) };
  }

  private launcherInstall() {
    const { FAVO_LAUNCHER: launcher, FAVO_LAUNCHER_NODE: node } = this.callerEnv;
    const source = launcher ? this.favoSourceOf(launcher) : undefined;
    return source && node && launcher ? { source, restart: this.planOf(node, [launcher]) } : undefined;
  }

  private favoSourceOf(path: string) {
    const source = installSourceOf(path);
    return source?.packageName === FavoPackage ? source : undefined;
  }

  private planOf(command: string, args: string[] = []) {
    return { command, args, env: {}, unsetEnv: [] };
  }
}
