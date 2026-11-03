import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, setDefaultTimeout } from 'bun:test';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { removeFolder } from './support/remove-folder';

setDefaultTimeout(60_000);

const PackageRoot = dirname(import.meta.dir);
const PretendHost = pathToFileURL(`${import.meta.dir}/support/pretend-host.mjs`).href;
const { version: Version } = JSON.parse(readFileSync(`${PackageRoot}/package.json`, 'utf8'));
const isWindows = process.platform === 'win32';
const AssetName = isWindows ? 'favo-windows-x64.exe.gz' : `favo-${process.platform}-${process.arch}.gz`;
const BinaryName = isWindows ? 'favo.exe' : 'favo';
const SumsPath = `/v${Version}/SHA256SUMS`;
const AssetPath = `/v${Version}/${AssetName}`;

let buildRoot: string;
let compressedFake: Uint8Array;
let server: ReturnType<typeof Bun.serve>;
let release: Record<string, Uint8Array | string>;
let requests: string[];
let root: string;
let installedPackage: string;
let favoHome: string;
let runtime: string;

function sha256(bytes: Uint8Array) {
  return new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
}

function launch(args: string[], options: { nodeArgs?: string[]; env?: Record<string, string> } = {}) {
  return Bun.spawn(['node', ...(options.nodeArgs ?? []), `${installedPackage}/bin/favo.mjs`, ...args], {
    env: {
      ...process.env,
      FAVO_HOME: favoHome,
      FAVO_RELEASE_BASE_URL: `http://127.0.0.1:${server.port}/`,
      ...options.env,
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

async function finished(child: ReturnType<typeof launch>) {
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

beforeAll(async () => {
  buildRoot = mkdtempSync(`${tmpdir()}/favo-npm-build-`).replaceAll('\\', '/');
  const outfile = `${buildRoot}/fake-favo${isWindows ? '.exe' : ''}`;
  const compile = Bun.spawnSync([
    process.execPath,
    'build',
    '--compile',
    `${import.meta.dir}/support/fake-favo.ts`,
    '--outfile',
    outfile,
  ]);
  expect(compile.exitCode).toBe(0);
  compressedFake = Bun.gzipSync(await Bun.file(outfile).bytes(), { level: 1 });
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const { pathname } = new URL(request.url);
      requests.push(pathname);
      const body = release[pathname];
      return body === undefined ? new Response('missing', { status: 404 }) : new Response(body);
    },
  });
});

afterAll(async () => {
  server.stop(true);
  await removeFolder(buildRoot);
});

beforeEach(() => {
  root = mkdtempSync(`${tmpdir()}/favo-npm-`).replaceAll('\\', '/');
  installedPackage = `${root}/package`;
  mkdirSync(`${installedPackage}/bin`, { recursive: true });
  copyFileSync(`${PackageRoot}/bin/favo.mjs`, `${installedPackage}/bin/favo.mjs`);
  copyFileSync(`${PackageRoot}/package.json`, `${installedPackage}/package.json`);
  favoHome = `${root}/favo-home`;
  runtime = `${favoHome}/runtime`;
  requests = [];
  release = {
    [SumsPath]: `${sha256(compressedFake)}  ${AssetName}\n`,
    [AssetPath]: compressedFake,
  };
});

afterEach(() => removeFolder(root));

describe('the first run', () => {
  it('downloads, verifies and runs the binary, passing arguments and the exit code through', async () => {
    const { stdout, stderr, code } = await finished(launch(['serve', 'with space', '--exit=7']));

    expect(JSON.parse(stdout)).toEqual(['serve', 'with space', '--exit=7']);
    expect(code).toBe(7);
    expect(stderr).toBe('');
    expect(requests).toEqual([SumsPath, AssetPath]);
    expect(existsSync(`${runtime}/${Version}/${BinaryName}`)).toBe(true);
    expect(readdirSync(`${runtime}/${Version}`).sort()).toEqual(['.install-complete', BinaryName].sort());
  });

  it('keeps the runtime in .favo under HOME when FAVO_HOME is empty', async () => {
    const { code } = await finished(launch(['--exit=0'], { env: { FAVO_HOME: '', HOME: root } }));

    expect(code).toBe(0);
    expect(existsSync(`${root}/.favo/runtime/${Version}/${BinaryName}`)).toBe(true);
  });
});

describe('the second run', () => {
  it('reuses the installed binary without touching the network', async () => {
    await finished(launch(['--exit=0']));
    requests = [];

    const { stdout, code } = await finished(launch(['again']));

    expect(JSON.parse(stdout)).toEqual(['again']);
    expect(code).toBe(0);
    expect(requests).toEqual([]);
  });

  it('installs again when the binary has gone missing from a finished install', async () => {
    await finished(launch(['--exit=0']));
    rmSync(`${runtime}/${Version}/${BinaryName}`);

    const { code } = await finished(launch(['--exit=3']));

    expect(code).toBe(3);
    expect(existsSync(`${runtime}/${Version}/${BinaryName}`)).toBe(true);
    expect(readdirSync(runtime)).toEqual([Version]);
  });
});

describe('a failed install', () => {
  it('refuses a checksum mismatch and leaves nothing installed', async () => {
    release[SumsPath] = `${sha256(new Uint8Array([1, 2, 3]))}  ${AssetName}\n`;

    const { stdout, stderr, code } = await finished(launch(['--exit=0']));

    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toBe(`favo: checksum mismatch for ${AssetName}\n`);
    expect(readdirSync(runtime)).toEqual([]);
  });

  it('refuses a release whose SHA256SUMS does not list this platform', async () => {
    release[SumsPath] = `${sha256(compressedFake)}  favo-plan9-x64.gz\n`;

    const { stderr, code } = await finished(launch(['--exit=0']));

    expect(code).toBe(1);
    expect(stderr).toBe(`favo: ${AssetName} is not listed in the release's SHA256SUMS\n`);
    expect(requests).toEqual([SumsPath]);
  });

  it('explains a 404 as a release that may not be out yet', async () => {
    release = {};

    const { stderr, code } = await finished(launch(['--exit=0']));

    expect(code).toBe(1);
    expect(stderr).toContain(`${SumsPath} does not exist yet`);
    expect(stderr).toContain(`If ${Version} was just released, try again in a few minutes.`);
    expect(existsSync(`${runtime}/${Version}`)).toBe(false);
  });

  it('explains a release host it cannot reach', async () => {
    const { stderr, code } = await finished(
      launch(['--exit=0'], { env: { FAVO_RELEASE_BASE_URL: 'http://127.0.0.1:1' } })
    );

    expect(code).toBe(1);
    expect(stderr).toContain(`favo: could not reach http://127.0.0.1:1${SumsPath}`);
  });
});

describe('a package that ships its own SHA256SUMS', () => {
  const Swapped = Bun.gzipSync(new TextEncoder().encode('#!/bin/sh\necho swapped\n'));

  it('checks the download against it without asking the release for hashes', async () => {
    writeFileSync(`${installedPackage}/SHA256SUMS`, `${sha256(compressedFake)}  ${AssetName}\n`);
    delete release[SumsPath];

    const { stdout, code } = await finished(launch(['bundled', '--exit=0']));

    expect(JSON.parse(stdout)).toEqual(['bundled', '--exit=0']);
    expect(code).toBe(0);
    expect(requests).toEqual([AssetPath]);
  });

  it('rejects a release whose binary and SHA256SUMS were swapped together', async () => {
    writeFileSync(`${installedPackage}/SHA256SUMS`, `${sha256(compressedFake)}  ${AssetName}\n`);
    release = { [SumsPath]: `${sha256(Swapped)}  ${AssetName}\n`, [AssetPath]: Swapped };

    const { stdout, stderr, code } = await finished(launch(['--exit=0']));

    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toBe(`favo: checksum mismatch for ${AssetName}\n`);
    expect(requests).toEqual([AssetPath]);
    expect(readdirSync(runtime)).toEqual([]);
  });

  it('never falls back to the release when this platform is not listed', async () => {
    writeFileSync(`${installedPackage}/SHA256SUMS`, `${sha256(compressedFake)}  favo-plan9-x64.gz\n`);

    const { stderr, code } = await finished(launch(['--exit=0']));

    expect(code).toBe(1);
    expect(stderr).toBe(`favo: ${AssetName} is not listed in this package's SHA256SUMS\n`);
    expect(requests).toEqual([]);
  });

  it('never falls back to the release when the file is empty', async () => {
    writeFileSync(`${installedPackage}/SHA256SUMS`, '');

    const { code } = await finished(launch(['--exit=0']));

    expect(code).toBe(1);
    expect(requests).toEqual([]);
  });
});

describe.skipIf(isWindows)('a version folder this user did not install', () => {
  function plantFinishedInstall(directory: string) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(`${directory}/${BinaryName}`, `#!/bin/sh\ntouch "${root}/planted-binary-ran"\n`, { mode: 0o755 });
    writeFileSync(`${directory}/.install-complete`, `${Version}\n`);
  }

  it('refuses a symlink that looks like a finished install', async () => {
    plantFinishedInstall(`${root}/planted`);
    mkdirSync(runtime, { recursive: true });
    symlinkSync(`${root}/planted`, `${runtime}/${Version}`);

    const { stdout, stderr, code } = await finished(launch(['--exit=0']));

    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toBe(
      `favo: ${runtime}/${Version} is a symlink, so favo won't run what's in it. Delete it, or set FAVO_HOME to a folder only you can write to.\n`
    );
    expect(existsSync(`${root}/planted-binary-ran`)).toBe(false);
    expect(requests).toEqual([]);
  });

  it('refuses a symlink that points at nothing', async () => {
    mkdirSync(runtime, { recursive: true });
    symlinkSync(`${root}/nowhere`, `${runtime}/${Version}`);

    const { stderr, code } = await finished(launch(['--exit=0']));

    expect(code).toBe(1);
    expect(stderr).toContain('is a symlink');
    expect(requests).toEqual([]);
  });

  it('refuses a finished install that belongs to another user', async () => {
    plantFinishedInstall(`${runtime}/${Version}`);

    const { stdout, stderr, code } = await finished(
      launch(['--exit=0'], {
        nodeArgs: ['--import', PretendHost],
        env: { FAKE_UID: String(process.getuid!() + 1) },
      })
    );

    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toBe(
      `favo: ${runtime}/${Version} belongs to another user, so favo won't run what's in it. Delete it, or set FAVO_HOME to a folder only you can write to.\n`
    );
    expect(existsSync(`${root}/planted-binary-ran`)).toBe(false);
    expect(requests).toEqual([]);
  });

  it('refuses an unfinished folder that belongs to another user instead of replacing it', async () => {
    mkdirSync(`${runtime}/${Version}`, { recursive: true });

    const { stderr, code } = await finished(
      launch(['--exit=0'], {
        nodeArgs: ['--import', PretendHost],
        env: { FAKE_UID: String(process.getuid!() + 1) },
      })
    );

    expect(code).toBe(1);
    expect(stderr).toContain('belongs to another user');
    expect(requests).toEqual([]);
  });

  it('accepts a home folder that is itself a symlink', async () => {
    mkdirSync(`${root}/real-home`);
    symlinkSync(`${root}/real-home`, favoHome);

    const { code } = await finished(launch(['--exit=0']));

    expect(code).toBe(0);
    expect(existsSync(`${root}/real-home/runtime/${Version}/${BinaryName}`)).toBe(true);
  });
});

describe('the binary it starts', () => {
  it.skipIf(isWindows)('hears the path it was started from, which survives an upgrade', async () => {
    const stable = `${root}/stable`;
    symlinkSync(installedPackage, stable);
    const child = Bun.spawn(['node', `${stable}/bin/favo.mjs`, '--print-launcher'], {
      env: { ...process.env, FAVO_HOME: favoHome, FAVO_RELEASE_BASE_URL: `http://127.0.0.1:${server.port}/` },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const { stdout, code } = await finished(child);

    expect(code).toBe(0);
    expect(JSON.parse(stdout.trim().split('\n').at(-1)!).launcher).toBe(`${stable}/bin/favo.mjs`);
  });

  it('learns where the launcher lives, so favo update can find the package manager', async () => {
    const { stdout, code } = await finished(launch(['--print-launcher']));

    expect(code).toBe(0);
    const told = JSON.parse(stdout.trim().split('\n').at(-1)!);
    expect(told.launcher.replaceAll('\\', '/')).toEndWith('/package/bin/favo.mjs');
    expect(existsSync(told.node)).toBe(true);
  });
});

describe('the runtime folder', () => {
  it('starts a new version while the old one is still running', async () => {
    const running = `${runtime}/0.0.1`;
    mkdirSync(running, { recursive: true });
    const oldBinary = `${running}/${BinaryName}`;
    copyFileSync(`${buildRoot}/fake-favo${isWindows ? '.exe' : ''}`, oldBinary);
    const old = Bun.spawn([oldBinary, '--wait-for-term'], { stdout: 'pipe', stderr: 'ignore', stdin: 'ignore' });
    await old.stdout.getReader().read();

    const { stdout, code } = await finished(launch(['--exit=0']));

    old.kill();
    await old.exited;
    expect(code).toBe(0);
    expect(stdout).toContain('--exit=0');
    expect(existsSync(`${runtime}/${Version}/${BinaryName}`)).toBe(true);
  });

  it('drops older versions after an install and keeps newer and unrelated folders', async () => {
    for (const name of ['0.0.1', '0.0.1.staging-abc123', '99.0.0', 'keep-me'])
      mkdirSync(`${runtime}/${name}`, { recursive: true });

    const { code } = await finished(launch(['--exit=0']));

    expect(code).toBe(0);
    expect(readdirSync(runtime).sort()).toEqual([Version, '99.0.0', 'keep-me'].sort());
  });

  it('replaces a half-installed folder that has no completion marker', async () => {
    mkdirSync(`${runtime}/${Version}`, { recursive: true });
    writeFileSync(`${runtime}/${Version}/partial`, 'left over');

    const { code } = await finished(launch(['--exit=5']));

    expect(code).toBe(5);
    expect(readdirSync(`${runtime}/${Version}`).sort()).toEqual(['.install-complete', BinaryName].sort());
    expect(readdirSync(runtime)).toEqual([Version]);
  });

  it('survives two first runs racing each other', async () => {
    const [first, second] = await Promise.all([
      finished(launch(['first', '--exit=0'])),
      finished(launch(['second', '--exit=0'])),
    ]);

    expect([first.code, first.stderr, second.code, second.stderr]).toEqual([0, '', 0, '']);
    expect(JSON.parse(first.stdout)[0]).toBe('first');
    expect(JSON.parse(second.stdout)[0]).toBe('second');
    expect(readdirSync(runtime)).toEqual([Version]);
  });
});

describe('an unsupported host', () => {
  it('names the platform and what is supported', async () => {
    const { stderr, code } = await finished(
      launch(['--exit=0'], {
        nodeArgs: ['--import', PretendHost],
        env: { FAKE_PLATFORM: 'freebsd', FAKE_ARCH: 'x64' },
      })
    );

    expect(code).toBe(1);
    expect(stderr).toBe(
      'favo: no favo build is available for freebsd-x64 (supported: darwin-arm64, darwin-x64, linux-arm64, linux-x64, win32-x64).\n'
    );
    expect(requests).toEqual([]);
  });

  it('says musl is not supported rather than failing in the loader', async () => {
    const { stderr, code } = await finished(
      launch(['--exit=0'], {
        nodeArgs: ['--import', PretendHost],
        env: { FAKE_PLATFORM: 'linux', FAKE_ARCH: 'x64', FAKE_MUSL: '1' },
      })
    );

    expect(code).toBe(1);
    expect(stderr).toContain("Alpine/musl isn't supported yet");
    expect(requests).toEqual([]);
  });
});

describe.skipIf(isWindows)('signals', () => {
  it('forwards SIGTERM to favo and exits with the code favo chose', async () => {
    const child = launch(['--wait-for-term']);
    const stdout = child.stdout.getReader();
    await stdout.read();

    child.kill('SIGTERM');

    expect(await child.exited).toBe(42);
  });

  it('reports a favo killed by a signal the way a shell would', async () => {
    const { code } = await finished(launch(['--die-by-sigkill']));

    expect(code).toBe(137);
  });
});
