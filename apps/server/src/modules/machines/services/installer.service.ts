import { RemoteSystem, versionFrom } from '@favo/domain/machines/machine';
import { installPlanFor, ProbeCommands } from '@favo/domain/machines/remote-commands';
import { assertDomain, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { EntryKind } from '@favo/domain/sharing/shared-item';
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
    await this.ssh.exec(target, plan.prepare);
    const upload = await this.ssh.upload(target, assetPath, plan.stagedPath);
    assertDomain(upload.code === 0, DomainErrorCode.machineUnreachable, `Upload to ${machine.name} failed.`);
    this.remotes.close(id);
    const activate = await this.ssh.exec(target, plan.activate);
    const version = versionFrom(activate.stdout);
    assertDomain(version, DomainErrorCode.machineUnreachable, `favo did not start on ${machine.name}.`);
    return { version };
  }
}
