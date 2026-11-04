import type { ProviderId } from '@favo/domain/providers/provider';
import { parseJson } from '@favo/domain/shared/parse-json';
import { EntryKind } from '@favo/domain/sharing/shared-item';
import { SavedUpdate } from '@favo/domain/updates/update-outcome';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { FavoPaths } from '@/shared/config/favo-paths';

export class ProviderUpdateRepository {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly paths: FavoPaths
  ) {}

  async last(provider: ProviderId) {
    const text = await this.fileSystem.readText(this.pathOf(provider));
    const saved = SavedUpdate.safeParse(parseJson(text ?? ''));
    return saved.success ? saved.data : undefined;
  }

  async save(provider: ProviderId, update: SavedUpdate) {
    await this.fileSystem.replaceText(this.pathOf(provider), `${JSON.stringify(update)}\n`);
  }

  async clear(provider: ProviderId) {
    const path = this.pathOf(provider);
    if ((await this.fileSystem.entry(path)).kind !== EntryKind.missing) await this.fileSystem.unlink(path);
  }

  private pathOf(provider: ProviderId) {
    return `${this.paths.updates}/${provider}.json`;
  }
}
