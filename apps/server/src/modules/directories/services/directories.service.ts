import {
  completeDirectoryInput,
  joinPath,
  matchesDirectory,
  nativePath,
  parseDirectoryInput,
} from '@favo/domain/directories/directory-input';
import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { FavoPaths } from '@/shared/config/favo-paths';
import type { HostFacts } from '@/shared/config/host-facts';

const MaximumEntries = 200;

export class DirectoriesService {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly paths: FavoPaths,
    private readonly host: HostFacts
  ) {}

  async list(input: string) {
    const { parent, prefix, full } = this.parse(input);
    const { isWindows } = this.paths;
    const names = (await this.fileSystem.list(parent))
      .filter((name) => matchesDirectory(name, prefix))
      .toSorted((left, right) => left.localeCompare(right));
    const isFolder = await Promise.all(names.map((name) => this.fileSystem.isDirectory(joinPath(parent, name))));
    const entries = names
      .filter((_, index) => isFolder[index])
      .slice(0, MaximumEntries)
      .map((name) => ({
        name,
        path: nativePath(joinPath(parent, name), isWindows),
        completion: completeDirectoryInput(input, name, isWindows ? '\\' : '/'),
      }));
    const exists = await this.fileSystem.isDirectory(full);
    return { directory: nativePath(full, isWindows), exists, entries };
  }

  async requireExisting(input: string) {
    const { directory, exists } = await this.list(input);
    if (!exists) throw new DomainError(DomainErrorCode.directoryNotFound, `No folder at ${directory}.`);
    return directory;
  }

  private parse(input: string) {
    return parseDirectoryInput(input, { home: this.paths.home, base: this.host.directory });
  }
}
