import { afterAll, describe, expect, it } from 'bun:test';
import { chmodSync, linkSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
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

describe('replacing a file on disk', () => {
  const fileSystem = new NodeFileSystem(process.platform);
  const folder = `${realRoot}/replacing`;

  it('leaves no temporary file behind', async () => {
    await fileSystem.replaceText(`${folder}/clean/file.json`, 'one');
    await fileSystem.replaceText(`${folder}/clean/file.json`, 'two');
    expect(await fileSystem.list(`${folder}/clean`)).toEqual(['file.json']);
  });
  it('lets every writer of a different file finish, at the same moment', async () => {
    const names = Array.from({ length: 30 }, (_, index) => `${index}.json`);
    await Promise.all(names.map((name) => fileSystem.replaceText(`${folder}/many/${name}`, name)));
    expect(await fileSystem.list(`${folder}/many`)).toHaveLength(30);
  });
  it('never shows a half written file to someone reading at the same moment', async () => {
    const path = `${folder}/whole/file.json`;
    const texts = ['a'.repeat(200_000), 'b'.repeat(200_000)];
    await fileSystem.replaceText(path, texts[0]!);
    const writes = Array.from({ length: 20 }, (_, index) => fileSystem.replaceText(path, texts[index % 2]!));
    const reads = Array.from({ length: 20 }, () => fileSystem.readText(path));
    await Promise.all(writes);
    const seen = (await Promise.all(reads)).filter((text) => text !== undefined);
    for (const text of seen) expect(texts).toContain(text);
  });
  it('writes in place over a hard link, so the other name still sees it', async () => {
    const path = `${folder}/hard/base.json`;
    await fileSystem.replaceText(path, 'one');
    linkSync(path, `${folder}/hard/seat.json`);
    await fileSystem.replaceText(path, 'two');
    expect(await fileSystem.readText(`${folder}/hard/seat.json`)).toBe('two');
  });
  it.skipIf(process.platform === 'win32')('keeps the permissions of a file it replaces', async () => {
    const path = `${folder}/mode/settings.json`;
    await fileSystem.replaceText(path, 'one');
    chmodSync(path, 0o664);
    await fileSystem.replaceText(path, 'two');
    expect(statSync(path).mode & 0o777).toBe(0o664);
  });
  it.skipIf(process.platform === 'win32')('says which file it could not write, and leaves nothing', async () => {
    const closed = `${folder}/closed`;
    await fileSystem.replaceText(`${closed}/file.json`, 'one');
    chmodSync(closed, 0o555);
    const writing = fileSystem.replaceText(`${closed}/file.json`, 'two');
    await expect(writing).rejects.toMatchObject({ code: 'invalidConfig' });
    await expect(writing).rejects.toThrow(`${closed}/file.json`);
    chmodSync(closed, 0o755);
    expect(await fileSystem.list(closed)).toEqual(['file.json']);
    expect(await fileSystem.readText(`${closed}/file.json`)).toBe('one');
  });
  it.skipIf(process.platform === 'win32')('keeps a new file to its owner', async () => {
    const path = `${folder}/mode/new.json`;
    await fileSystem.replaceText(path, 'one');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});

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
  it('reads only the start of a file', async () => {
    await fileSystem.writePrivateText(`${root}/head/long`, 'abcdef');
    expect(await fileSystem.readHead(`${root}/head/long`, 3)).toBe('abc');
    expect(await fileSystem.readHead(`${root}/head/long`, 100)).toBe('abcdef');
    expect(await fileSystem.readHead(`${root}/head/missing`, 3)).toBeUndefined();
  });
  it('replaces a file, creating its folder', async () => {
    await fileSystem.replaceText(`${root}/replace/deep/file`, 'one');
    await fileSystem.replaceText(`${root}/replace/deep/file`, 'two');
    expect(await fileSystem.readText(`${root}/replace/deep/file`)).toBe('two');
  });
  it('replaces the target of a link and leaves the link standing', async () => {
    await fileSystem.writePrivateText(`${root}/replace/base`, 'one');
    await fileSystem.link(`${root}/replace/base`, `${root}/replace/seat`);
    await fileSystem.replaceText(`${root}/replace/seat`, 'two');
    expect((await fileSystem.entry(`${root}/replace/seat`)).kind).toBe(EntryKind.link);
    expect(await fileSystem.readText(`${root}/replace/base`)).toBe('two');
  });
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
