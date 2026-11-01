import { EntryKind } from '@favo/domain/sharing/shared-item';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { FavoPaths } from '@/shared/config/favo-paths';

export class AccountRepository {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly paths: FavoPaths
  ) {}

  async names() {
    const entries = await this.fileSystem.list(this.paths.accounts);
    const kinds = await Promise.all(entries.map((name) => this.fileSystem.entry(this.pathOf(name))));
    return entries.filter((_, index) => kinds[index]?.kind === EntryKind.directory).toSorted();
  }

  async exists(name: string) {
    return (await this.fileSystem.entry(this.pathOf(name))).kind !== EntryKind.missing;
  }

  async create(name: string) {
    await this.fileSystem.ensureDirectory(this.pathOf(name));
  }

  async trash(name: string, stamp: string) {
    const trashedTo = `${this.paths.trash}/${name}-${stamp}`;
    await this.fileSystem.move(this.pathOf(name), trashedTo);
    return trashedTo;
  }

  private pathOf(name: string) {
    return `${this.paths.accounts}/${name}`;
  }
}
