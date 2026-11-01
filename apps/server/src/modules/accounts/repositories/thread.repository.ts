import type { ProviderId } from '@favo/domain/providers/provider';
import { EntryKind } from '@favo/domain/sharing/shared-item';
import { Thread } from '@favo/domain/threads/thread';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { FavoPaths } from '@/shared/config/favo-paths';

const RecordSuffix = '.json';

export class ThreadRepository {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly paths: FavoPaths
  ) {}

  async list(account: string, provider: ProviderId) {
    const folder = this.folderOf(account, provider);
    const names = (await this.fileSystem.list(folder)).filter((name) => name.endsWith(RecordSuffix));
    const texts = await Promise.all(names.map((name) => this.fileSystem.readText(`${folder}/${name}`)));
    return texts.flatMap((text) => {
      const thread = parseRecord(text);
      return thread ? [thread] : [];
    });
  }

  async save(account: string, provider: ProviderId, thread: Thread) {
    await this.fileSystem.replaceText(this.pathOf(account, provider, thread.id), `${JSON.stringify(thread)}\n`);
  }

  async remove(account: string, provider: ProviderId, id: string) {
    await this.fileSystem.unlink(this.pathOf(account, provider, id));
  }

  async trash(account: string, trashedTo: string) {
    const folder = `${this.paths.threads}/${account}`;
    if ((await this.fileSystem.entry(folder)).kind === EntryKind.missing) return;
    await this.fileSystem.move(folder, `${trashedTo}/threads`);
  }

  private folderOf(account: string, provider: ProviderId) {
    return `${this.paths.threads}/${account}/${provider}`;
  }

  private pathOf(account: string, provider: ProviderId, id: string) {
    return `${this.folderOf(account, provider)}/${id}${RecordSuffix}`;
  }
}

function parseRecord(text: string | undefined) {
  try {
    return Thread.parse(JSON.parse(text ?? ''));
  } catch {
    return undefined;
  }
}
