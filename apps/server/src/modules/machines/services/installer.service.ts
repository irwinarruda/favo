import { installHooks } from '@favo/contracts/rpc/hooks/install-hooks';
import { listHooks } from '@favo/contracts/rpc/hooks/list-hooks';
import { refreshHooks } from '@favo/contracts/rpc/hooks/refresh-hooks';
import { HookState } from '@favo/domain/hooks/provider-hook';
import { RemoteSystem, versionFrom } from '@favo/domain/machines/machine';
import { installPlanFor, ProbeCommands } from '@favo/domain/machines/remote-commands';
import { assertDomain, DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { EntryKind } from '@favo/domain/sharing/shared-item';
import type { HooksService } from '@/modules/accounts/services/hooks.service';
import type { ReleaseAssets } from '@/modules/machines/gateways/release-assets';
import type { RemoteBackends } from '@/modules/machines/gateways/remote-backends';
import type { Ssh } from '@/modules/machines/gateways/ssh';
import type { MachinesService } from '@/modules/machines/services/machines.service';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { FavoPaths } from '@/shared/config/favo-paths';

export class InstallerService {
  constructor(
    private readonly machines: MachinesService,
    private readonly ssh: Ssh,
    private readonly remotes: RemoteBackends,
    private readonly releaseAssets: ReleaseAssets,
    private readonly hooks: HooksService,
    private readonly fileSystem: FileSystem,
    private readonly paths: FavoPaths,
    private readonly version: string
  ) {}

  async install(id: string) {
    const machine = await this.machines.requireRemote(id);
    const target = machine.target!;
    const system = machine.system ?? RemoteSystem.posix;
    const uname = system === RemoteSystem.posix ? await this.ssh.exec(target, ProbeCommands.posix) : undefined;
    assertDomain(uname?.code !== 255, DomainErrorCode.machineUnreachable, `Could not reach ${machine.name}.`);
    const plan = installPlanFor(system, uname?.stdout ?? '');
    const assetPath = `${this.paths.versionedAssets}/${plan.assetName}`;
    if ((await this.fileSystem.entry(assetPath)).kind === EntryKind.missing) {
      await this.releaseAssets.download(plan.assetName, this.version, assetPath);
    }
    const hooksStep = await this.hooksStepFor(id);
    await this.ssh.exec(target, plan.prepare);
    const upload = await this.ssh.upload(target, assetPath, plan.stagedPath);
    assertDomain(upload.code === 0, DomainErrorCode.machineUnreachable, `Upload to ${machine.name} failed.`);
    this.remotes.close(id);
    const activate = await this.ssh.exec(target, plan.activate);
    const version = versionFrom(activate.stdout);
    assertDomain(version, DomainErrorCode.machineUnreachable, `favo did not start on ${machine.name}.`);
    if (hooksStep) await this.machines.forward(this.request(hooksStep, id)).catch(() => undefined);
    return { version };
  }

  private async hooksStepFor(machineId: string) {
    try {
      const response = await this.machines.forward(this.request(listHooks.name, machineId));
      const hooks = response.ok ? listHooks.result.safeParse(response.result).data : undefined;
      return hooks?.some(({ state }) => state !== HookState.absent) ? refreshHooks.name : undefined;
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      if (error.code !== DomainErrorCode.machineNeedsInstall) return undefined;
      return (await this.hooks.isInstalled()) ? installHooks.name : undefined;
    } finally {
      this.remotes.close(machineId);
    }
  }

  private request(method: string, machineId: string) {
    return { id: 0, method, params: {}, machineId };
  }
}
