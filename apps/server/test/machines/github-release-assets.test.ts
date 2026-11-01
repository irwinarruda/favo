import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { GithubReleaseAssets } from '@/modules/machines/gateways/github.release-assets';

const Version = '1.2.3';
const Asset = 'favo-linux-x64';
const PackedAsset = `${Asset}.gz`;
const Binary = Buffer.from('#!/bin/sh\necho "favo is here"\n');
const Packed = gzipSync(Binary);
const ChecksumsPath = `/v${Version}/SHA256SUMS`;
const AssetPath = `/v${Version}/${PackedAsset}`;

type Routes = Record<string, () => Response>;

let root: string;
let folder: string;
let destination: string;
let requests: string[];
let server: ReturnType<typeof Bun.serve> | undefined;

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function releaseOf(packed: Uint8Array, checksums = `${sha256(packed)}  ${PackedAsset}\n`): Routes {
  return { [ChecksumsPath]: () => new Response(checksums), [AssetPath]: () => new Response(packed) };
}

function serve(routes: Routes) {
  const started = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const { pathname } = new URL(request.url);
      requests.push(pathname);
      return routes[pathname]?.() ?? new Response('Not Found', { status: 404 });
    },
  });
  server = started;
  return `http://127.0.0.1:${started.port}`;
}

function expectNothingWritten() {
  expect(existsSync(destination)).toBe(false);
  expect(existsSync(folder) ? readdirSync(folder) : []).toEqual([]);
}

beforeEach(() => {
  root = mkdtempSync(`${tmpdir()}/favo-release-`).replaceAll('\\', '/');
  folder = `${root}/assets/${Version}`;
  destination = `${folder}/${Asset}`;
  requests = [];
});

afterEach(async () => {
  await server?.stop(true);
  server = undefined;
  rmSync(root, { recursive: true, force: true });
});

describe('downloading a release binary', () => {
  it('fetches the versioned files and leaves only the unpacked binary, in a folder it creates', async () => {
    const assets = new GithubReleaseAssets(serve(releaseOf(Packed)));
    await assets.download(Asset, Version, destination);
    expect(requests).toEqual([ChecksumsPath, AssetPath]);
    expect(readFileSync(destination).equals(Binary)).toBe(true);
    expect(readdirSync(folder)).toEqual([Asset]);
  });
  it.skipIf(process.platform === 'win32')('leaves a binary that runs', async () => {
    const assets = new GithubReleaseAssets(serve(releaseOf(Packed)));
    await assets.download(Asset, Version, destination);
    expect(Bun.spawnSync([destination]).stdout.toString()).toBe('favo is here\n');
  });
  it('finds its line among every file of the release', async () => {
    const [before, after] = ['favo-darwin-arm64.gz', 'favo-windows-x64.exe.gz'].map(
      (name) => `${'a'.repeat(64)}  ${name}`
    );
    const checksums = [before, `${sha256(Packed).toUpperCase()}  ${PackedAsset}`, after].join('\r\n');
    const assets = new GithubReleaseAssets(serve(releaseOf(Packed, checksums)));
    await assets.download(Asset, Version, destination);
    expect(readFileSync(destination).equals(Binary)).toBe(true);
  });
  it('follows the redirect GitHub answers with', async () => {
    const assets = new GithubReleaseAssets(
      serve({
        ...releaseOf(Packed),
        [AssetPath]: () => new Response(undefined, { status: 302, headers: { location: '/storage/object' } }),
        '/storage/object': () => new Response(Packed),
      })
    );
    await assets.download(Asset, Version, destination);
    expect(readFileSync(destination).equals(Binary)).toBe(true);
  });
  it('verifies the bytes as published when a server marks them gzip-encoded', async () => {
    const assets = new GithubReleaseAssets(
      serve({
        ...releaseOf(Packed),
        [AssetPath]: () => new Response(Packed, { headers: { 'content-encoding': 'gzip' } }),
      })
    );
    await assets.download(Asset, Version, destination);
    expect(readFileSync(destination).equals(Binary)).toBe(true);
  });
  it('swaps a binary in whole, never writing over the one already there', async () => {
    const assets = new GithubReleaseAssets(serve(releaseOf(Packed)));
    mkdirSync(folder, { recursive: true });
    writeFileSync(destination, 'previous binary');
    linkSync(destination, `${root}/same-file`);
    await assets.download(Asset, Version, destination);
    expect(readFileSync(destination).equals(Binary)).toBe(true);
    expect(readFileSync(`${root}/same-file`, 'utf8')).toBe('previous binary');
  });
  it('lets two machines download the same binary at once', async () => {
    const assets = new GithubReleaseAssets(serve(releaseOf(Packed)));
    await Promise.all([assets.download(Asset, Version, destination), assets.download(Asset, Version, destination)]);
    expect(readFileSync(destination).equals(Binary)).toBe(true);
    expect(readdirSync(folder)).toEqual([Asset]);
  });
});

describe('refusing a release binary', () => {
  it('fails hard on a wrong checksum before touching the bytes, names the file and writes nothing', async () => {
    const tampered = Buffer.from('not what the release published');
    const assets = new GithubReleaseAssets(serve(releaseOf(tampered, `${sha256(Packed)}  ${PackedAsset}\n`)));
    await expect(assets.download(Asset, Version, destination)).rejects.toMatchObject({
      code: 'assetMissing',
      message: `${PackedAsset} (favo ${Version}) failed its checksum.`,
    });
    expectNothingWritten();
  });
  it('refuses a file SHA256SUMS does not list, even under a similar name', async () => {
    const lines = ['favo-linux-arm64.gz', `${PackedAsset}.sig`, `old-${PackedAsset}`];
    const checksums = lines.map((name) => `${sha256(Packed)}  ${name}`).join('\n');
    const assets = new GithubReleaseAssets(serve(releaseOf(Packed, checksums)));
    await expect(assets.download(Asset, Version, destination)).rejects.toMatchObject({
      code: 'assetMissing',
      message: `The favo ${Version} release does not list ${PackedAsset}.`,
    });
    expect(requests).toEqual([ChecksumsPath]);
    expectNothingWritten();
  });
  it('says a version has no release, and only then points to a local build', async () => {
    const assets = new GithubReleaseAssets(serve({}));
    await expect(assets.download(Asset, Version, destination)).rejects.toMatchObject({
      code: 'assetMissing',
      message: `favo ${Version} has no published release, so there is no ${Asset} to download. From source, run: bun run build:all && bun run install:local`,
    });
    expectNothingWritten();
  });
  it('refuses a corrupt gzip whose checksum matches', async () => {
    const corrupt = Packed.subarray(0, Packed.length - 4);
    const assets = new GithubReleaseAssets(serve(releaseOf(corrupt)));
    const failure = await assets.download(Asset, Version, destination).catch((error) => error);
    expect(failure).toMatchObject({ code: 'assetMissing' });
    expect(failure.message).toStartWith(`${PackedAsset} (favo ${Version}) is corrupt: `);
    expect(failure.message).not.toContain('build:all');
    expectNothingWritten();
  });
  it('tells a listed file that is gone from a release that does not exist', async () => {
    const { [AssetPath]: _gone, ...routes } = releaseOf(Packed);
    const assets = new GithubReleaseAssets(serve(routes));
    const failure = await assets.download(Asset, Version, destination).catch((error) => error);
    expect(failure.message).toBe(`The favo ${Version} release lists ${PackedAsset} but lacks it.`);
    expectNothingWritten();
  });
  it('reports a server error as a failed download, not a missing release', async () => {
    const assets = new GithubReleaseAssets(serve({ [ChecksumsPath]: () => new Response('down', { status: 503 }) }));
    await expect(assets.download(Asset, Version, destination)).rejects.toMatchObject({
      code: 'assetMissing',
      message: `Could not download SHA256SUMS (favo ${Version}): the server answered 503`,
    });
  });
  it('reports a server it cannot reach', async () => {
    const assets = new GithubReleaseAssets(serve({}));
    await server?.stop(true);
    const failure = await assets.download(Asset, Version, destination).catch((error) => error);
    expect(failure).toMatchObject({ code: 'assetMissing' });
    expect(failure.message).toStartWith(`Could not download SHA256SUMS (favo ${Version}): `);
    expect(failure.message).not.toContain('build:all');
  });
  it('gives up on a download that stalls and writes nothing', async () => {
    const stalled = () =>
      new Response(new ReadableStream({ start: (stream) => stream.enqueue(Packed.subarray(0, 8)) }));
    const assets = new GithubReleaseAssets(serve({ ...releaseOf(Packed), [AssetPath]: stalled }), 100);
    await expect(assets.download(Asset, Version, destination)).rejects.toMatchObject({
      code: 'assetMissing',
      message: `Could not download ${PackedAsset} (favo ${Version}): it timed out`,
    });
    expectNothingWritten();
  });
  it('reports a binary it cannot save and leaves no temporary file', async () => {
    mkdirSync(`${destination}/occupied`, { recursive: true });
    const assets = new GithubReleaseAssets(serve(releaseOf(Packed)));
    const failure = await assets.download(Asset, Version, destination).catch((error) => error);
    expect(failure).toMatchObject({ code: 'assetMissing' });
    expect(failure.message).toStartWith(`Could not save ${Asset} (favo ${Version}): `);
    expect(readdirSync(folder)).toEqual([Asset]);
  });
});
