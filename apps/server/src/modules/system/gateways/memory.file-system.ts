import { type Entry, EntryKind } from '@favo/domain/sharing/shared-item';
import { FileSystem } from '@/modules/system/gateways/file-system';

type Node = { kind: 'file'; text: string } | { kind: 'directory' } | { kind: 'link'; target: string };

export class MemoryFileSystem extends FileSystem {
  private readonly nodes = new Map<string, Node>([['/', { kind: 'directory' }]]);

  async entry(path: string): Promise<Entry> {
    const node = this.nodes.get(normalize(path));
    if (!node) return { kind: EntryKind.missing };
    if (node.kind === 'link') {
      const target = this.nodes.get(normalize(node.target));
      return { kind: target ? EntryKind.link : EntryKind.brokenLink, target: node.target };
    }
    return { kind: node.kind === 'directory' ? EntryKind.directory : EntryKind.file };
  }

  async list(path: string) {
    const prefix = `${normalize(path)}/`;
    return [...this.nodes.keys()]
      .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
      .map((key) => key.slice(prefix.length))
      .toSorted();
  }

  async isDirectory(path: string) {
    return this.nodes.get(this.resolve(normalize(path)))?.kind === 'directory';
  }

  async ensureDirectory(path: string) {
    const parts = normalize(path).split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += `/${part}`;
      if (!this.nodes.has(current)) this.nodes.set(current, { kind: 'directory' });
    }
  }

  async ensurePrivateDirectory(path: string) {
    await this.ensureDirectory(path);
  }

  async realPath(path: string) {
    const parts: string[] = [];
    for (const part of normalize(path).split('/').filter(Boolean)) {
      if (part === '..') parts.pop();
      else if (part !== '.') parts.push(part);
    }
    return this.resolve(`/${parts.join('/')}`);
  }

  async link(target: string, path: string) {
    await this.ensureDirectory(parentOf(path));
    if (this.nodes.has(normalize(path))) throw new Error(`EEXIST: ${path}`);
    this.nodes.set(normalize(path), { kind: 'link', target });
  }

  async unlink(path: string) {
    if (!this.nodes.delete(normalize(path))) throw new Error(`ENOENT: ${path}`);
  }

  async move(from: string, to: string) {
    const source = normalize(from);
    if (!this.nodes.has(source)) throw new Error(`ENOENT: ${from}`);
    await this.ensureDirectory(parentOf(to));
    const destination = normalize(to);
    for (const [key, node] of [...this.nodes.entries()]) {
      if (key !== source && !key.startsWith(`${source}/`)) continue;
      this.nodes.delete(key);
      this.nodes.set(`${destination}${key.slice(source.length)}`, node);
    }
  }

  async readText(path: string): Promise<string | undefined> {
    const resolved = this.resolve(normalize(path));
    const node = this.nodes.get(resolved);
    return node?.kind === 'file' ? node.text : undefined;
  }

  async readHead(path: string, bytes: number) {
    return (await this.readText(path))?.slice(0, bytes);
  }

  async replaceText(path: string, text: string) {
    await this.writePrivateText(await this.realPath(path), text);
  }

  private resolve(path: string): string {
    const node = this.nodes.get(path);
    if (node?.kind === 'link') return this.resolve(normalize(node.target));
    for (const [key, candidate] of this.nodes) {
      if (candidate.kind === 'link' && path.startsWith(`${key}/`)) {
        return this.resolve(`${normalize(candidate.target)}${path.slice(key.length)}`);
      }
    }
    return path;
  }

  async writePrivateText(path: string, text: string) {
    await this.ensureDirectory(parentOf(path));
    this.nodes.set(normalize(path), { kind: 'file', text });
  }
}

function normalize(path: string) {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function parentOf(path: string) {
  return normalize(path).split('/').slice(0, -1).join('/') || '/';
}
