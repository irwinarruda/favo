import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { ReleaseAssets } from '@/modules/machines/gateways/release-assets';
import type { FileSystem } from '@/modules/system/gateways/file-system';

export class ScriptedReleaseAssets extends ReleaseAssets {
  readonly downloads: { assetName: string; version: string; destination: string }[] = [];
  failure?: string;

  constructor(private readonly fileSystem: FileSystem) {
    super();
  }

  async download(assetName: string, version: string, destination: string) {
    this.downloads.push({ assetName, version, destination });
    if (this.failure) throw new DomainError(DomainErrorCode.assetMissing, this.failure);
    await this.fileSystem.writePrivateText(destination, `${assetName} ${version}`);
  }
}
