import { afterAll, describe, expect, it } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { EntryKind, planSharedItem, SharedItemState } from '@favo/domain/sharing/shared-item';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import { MemoryFileSystem } from '@/modules/system/gateways/memory.file-system';
import { NodeFileSystem } from '@/modules/system/gateways/node.file-system';

const realRoot = mkdtempSync(`${tmpdir()}/favo-fs-`).replaceAll('\\', '/');
afterAll(() => rmSync(realRoot, { recursive: true, force: true }));

const doubles: [string, FileSystem, string][] = [
  ['node', new NodeFileSystem(process.platform), realRoot],
  ['memory', new MemoryFileSystem(), '/root'],
];

describe.skipIf(process.platform === 'win32')('a private folder on disk', () => {
  const fileSystem = new NodeFileSystem(process.platform);
  const modeOf = (path: string) => statSync(path).mode & 0o777;

  it('is created for its owner alone', async () => {
    await fileSystem.ensurePrivateDirectory(`${realRoot}/sealed/new`);
    expect(modeOf(`${realRoot}/sealed/new`)).toBe(0o700);
  });
  it('is closed when it already exists and is open', async () => {
    mkdirSync(`${realRoot}/sealed/open`, { recursive: true });
    chmodSync(`${realRoot}/sealed/open`, 0o755);
    await fileSystem.ensurePrivateDirectory(`${realRoot}/sealed/open`);
    expect(modeOf(`${realRoot}/sealed/open`)).toBe(0o700);
  });
  it('says so in plain words when it cannot', async () => {
    await fileSystem.writePrivateText(`${realRoot}/sealed/file`, 'not a folder');
    await expect(fileSystem.ensurePrivateDirectory(`${realRoot}/sealed/file/home`)).rejects.toMatchObject({
      code: 'invalidConfig',
    });
  });
});

describe.each(doubles)('%s file system', (_name, fileSystem, root) => {
  it('sees a missing path', async () => {
    expect((await fileSystem.entry(`${root}/nope`)).kind).toBe(EntryKind.missing);
    expect(await fileSystem.list(`${root}/nope`)).toEqual([]);
    expect(await fileSystem.readText(`${root}/nope`)).toBeUndefined();
  });
  it('writes and reads through parents it creates', async () => {
    await fileSystem.writePrivateText(`${root}/a/b/file.txt`, 'hello');
    expect(await fileSystem.readText(`${root}/a/b/file.txt`)).toBe('hello');
    expect((await fileSystem.entry(`${root}/a/b`)).kind).toBe(EntryKind.directory);
    expect((await fileSystem.entry(`${root}/a/b/file.txt`)).kind).toBe(EntryKind.file);
    expect(await fileSystem.list(`${root}/a`)).toEqual(['b']);
  });
  it('links a file so it reads the same content, and knows it is the same file', async () => {
    await fileSystem.writePrivateText(`${root}/target.txt`, 'content');
    await fileSystem.link(`${root}/target.txt`, `${root}/links/one`);
    expect(await fileSystem.readText(`${root}/links/one`)).toBe('content');
    const seat = await fileSystem.entry(`${root}/links/one`);
    const base = await fileSystem.entry(`${root}/target.txt`);
    const plan = planSharedItem({ base, seat, basePath: `${root}/target.txt` });
    expect(plan.state).toBe(SharedItemState.linked);
  });
  it('links a folder, sees through it, and sees it break when the target goes', async () => {
    await fileSystem.writePrivateText(`${root}/shared/skill.md`, 'skill');
    await fileSystem.link(`${root}/shared`, `${root}/links/folder`);
    const linked = await fileSystem.entry(`${root}/links/folder`);
    expect(linked).toEqual({ kind: EntryKind.link, target: `${root}/shared` });
    expect(await fileSystem.readText(`${root}/links/folder/skill.md`)).toBe('skill');
    await fileSystem.move(`${root}/shared`, `${root}/moved`);
    expect((await fileSystem.entry(`${root}/links/folder`)).kind).toBe(EntryKind.brokenLink);
    await fileSystem.unlink(`${root}/links/folder`);
    expect((await fileSystem.entry(`${root}/links/folder`)).kind).toBe(EntryKind.missing);
  });
  it('tells folders from files, and sees a folder through a link', async () => {
    await fileSystem.writePrivateText(`${root}/kinds/file.txt`, 'x');
    await fileSystem.link(`${root}/kinds`, `${root}/kinds-link`);
    expect(await fileSystem.isDirectory(`${root}/kinds`)).toBe(true);
    expect(await fileSystem.isDirectory(`${root}/kinds-link`)).toBe(true);
    expect(await fileSystem.isDirectory(`${root}/kinds/file.txt`)).toBe(false);
    expect(await fileSystem.isDirectory(`${root}/nothing`)).toBe(false);
  });
  it('makes a private folder, and is fine when it is already there', async () => {
    await fileSystem.ensurePrivateDirectory(`${root}/private/home`);
    await fileSystem.ensurePrivateDirectory(`${root}/private/home`);
    expect((await fileSystem.entry(`${root}/private/home`)).kind).toBe(EntryKind.directory);
  });
  it('follows links and dots to where a path really is', async () => {
    await fileSystem.ensureDirectory(`${root}/real/inner`);
    await fileSystem.link(`${root}/real`, `${root}/real-link`);
    const real = await fileSystem.realPath(`${root}/real/inner`);
    expect(await fileSystem.realPath(`${root}/real-link/inner`)).toBe(real);
    expect(await fileSystem.realPath(`${root}/real/x/../inner`)).toBe(real);
    expect(await fileSystem.realPath(`${root}/real/inner/`)).toBe(real);
  });
  it('finds where a path would be when its end is missing', async () => {
    await fileSystem.ensureDirectory(`${root}/real`);
    await fileSystem.link(`${root}/real`, `${root}/other-link`);
    const real = await fileSystem.realPath(`${root}/real`);
    expect(await fileSystem.realPath(`${root}/other-link/not/yet`)).toBe(`${real}/not/yet`);
  });
  it('moves a folder with what is inside', async () => {
    await fileSystem.writePrivateText(`${root}/from/inner/file.txt`, 'moved');
    await fileSystem.move(`${root}/from`, `${root}/to/here`);
    expect(await fileSystem.readText(`${root}/to/here/inner/file.txt`)).toBe('moved');
    expect((await fileSystem.entry(`${root}/from`)).kind).toBe(EntryKind.missing);
  });
});
