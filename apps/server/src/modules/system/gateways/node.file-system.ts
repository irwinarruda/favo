import {
  chmod,
  link as hardLink,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { EntryKind } from '@favo/domain/sharing/shared-item';
import { FileSystem } from '@/modules/system/gateways/file-system';
import { renameOver } from '@/modules/system/utils/rename-over';

const WindowsPlatform = 'win32';
const PrivateDirectoryMode = 0o700;
const PrivateFileMode = 0o600;
const PermissionBits = 0o777;
const NewFileOnly = 'wx';

export class NodeFileSystem extends FileSystem {
  constructor(private readonly platform: string) {
    super();
  }

  async entry(path: string) {
    const link = await lstat(path).catch(() => undefined);
    if (!link) return { kind: EntryKind.missing };
    if (link.isSymbolicLink()) {
      const target = this.normalizeTarget(await readlink(path));
      const resolved = await stat(path).catch(() => undefined);
      return { kind: resolved ? EntryKind.link : EntryKind.brokenLink, target };
    }
    if (link.isDirectory()) return { kind: EntryKind.directory };
    return { kind: EntryKind.file, identity: `${link.dev}:${link.ino}` };
  }

  async list(path: string) {
    return readdir(path).catch(() => []);
  }

  async isDirectory(path: string) {
    return stat(path)
      .then((entry) => entry.isDirectory())
      .catch(() => false);
  }

  async ensureDirectory(path: string) {
    await mkdir(path, { recursive: true });
  }

  async ensurePrivateDirectory(path: string) {
    try {
      await mkdir(path, { recursive: true, mode: PrivateDirectoryMode });
      if (this.platform !== WindowsPlatform) await chmod(path, PrivateDirectoryMode);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new DomainError(DomainErrorCode.invalidConfig, `Could not make ${path} private: ${reason}`);
    }
  }

  async realPath(path: string): Promise<string> {
    const found = await realpath(path).catch(() => undefined);
    if (found) return found;
    const parent = dirname(path);
    return parent === path ? path : `${await this.realPath(parent)}/${basename(path)}`;
  }

  async link(target: string, path: string) {
    await mkdir(dirname(path), { recursive: true });
    if (this.platform === WindowsPlatform) await this.linkOnWindows(target, path);
    else await symlink(target, path);
  }

  async unlink(path: string) {
    await unlink(path);
  }

  async move(from: string, to: string) {
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
  }

  async readText(path: string) {
    return readFile(path, 'utf8').catch(() => undefined);
  }

  async writePrivateText(path: string, text: string) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, { mode: 0o600 });
    await chmod(path, 0o600);
  }

  async readHead(path: string, bytes: number) {
    const file = await open(path, 'r').catch(() => undefined);
    if (!file) return undefined;
    try {
      const { buffer, bytesRead } = await file.read(Buffer.alloc(bytes), 0, bytes, 0);
      return buffer.toString('utf8', 0, bytesRead);
    } finally {
      await file.close();
    }
  }

  async replaceText(path: string, text: string) {
    const realPath = await this.realPath(path);
    const temporary = `${realPath}.${crypto.randomUUID()}.tmp`;
    try {
      const existing = await stat(realPath).catch(() => undefined);
      await mkdir(dirname(realPath), { recursive: true });
      await writeFile(temporary, text, { flag: NewFileOnly, mode: PrivateFileMode });
      if (existing && existing.nlink > 1) {
        await writeFile(realPath, text);
      } else {
        await chmod(temporary, modeOf(existing));
        await renameOver(temporary, realPath);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new DomainError(DomainErrorCode.invalidConfig, `Could not write ${path}: ${reason}`);
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }

  private async linkOnWindows(target: string, path: string) {
    if ((await stat(target)).isDirectory()) {
      await symlink(target, path, 'junction');
      return;
    }
    await symlink(target, path, 'file').catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPERM') throw error;
      return hardLink(target, path);
    });
  }

  private normalizeTarget(target: string) {
    if (this.platform !== WindowsPlatform) return target;
    return target
      .replace(/^\\\\\?\\/, '')
      .replaceAll('\\', '/')
      .replace(/\/$/, '');
  }
}

function modeOf(existing: { mode: number } | undefined) {
  return existing ? existing.mode & PermissionBits : PrivateFileMode;
}
