import type { Entry } from '@favo/domain/sharing/shared-item';

export abstract class FileSystem {
  abstract entry(path: string): Promise<Entry>;
  abstract list(path: string): Promise<string[]>;
  abstract isDirectory(path: string): Promise<boolean>;
  abstract ensureDirectory(path: string): Promise<void>;
  abstract ensurePrivateDirectory(path: string): Promise<void>;
  abstract realPath(path: string): Promise<string>;
  abstract link(target: string, path: string): Promise<void>;
  abstract unlink(path: string): Promise<void>;
  abstract move(from: string, to: string): Promise<void>;
  abstract readText(path: string): Promise<string | undefined>;
  abstract readHead(path: string, bytes: number): Promise<string | undefined>;
  abstract replaceText(path: string, text: string): Promise<void>;
  abstract writePrivateText(path: string, text: string): Promise<void>;
}
