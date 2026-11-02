#!/usr/bin/env node
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';

const PackageRoot = path.dirname(import.meta.dirname);
const { version } = JSON.parse(fs.readFileSync(path.join(PackageRoot, 'package.json'), 'utf8'));

const DefaultReleaseBaseUrl = 'https://github.com/irwinarruda/favo-cli/releases/download';
const Assets = {
  'darwin-arm64': 'favo-darwin-arm64.gz',
  'darwin-x64': 'favo-darwin-x64.gz',
  'linux-arm64': 'favo-linux-arm64.gz',
  'linux-x64': 'favo-linux-x64.gz',
  'win32-x64': 'favo-windows-x64.exe.gz',
};
const ChecksumLine = /^([0-9a-f]{64})\s+\*?(.+)$/i;
const VersionPrefix = /^\d+\.\d+\.\d+/;
const CompletionMarker = '.install-complete';
const BinaryName = process.platform === 'win32' ? 'favo.exe' : 'favo';
const ForwardedSignals = process.platform === 'win32' ? ['SIGTERM'] : ['SIGTERM', 'SIGHUP'];

function setting(name) {
  const value = (process.env[name] ?? '').trim();
  return value === '' ? undefined : value;
}

function favoHome() {
  const configured = setting('FAVO_HOME');
  return configured ? path.resolve(configured) : path.join(process.env.HOME ?? os.homedir(), '.favo');
}

async function get(url) {
  const response = await fetch(url).catch((error) => {
    throw new Error(`could not reach ${url}: ${error.cause?.message ?? error.message}`, { cause: error });
  });
  if (response.status === 404) {
    throw new Error(`${url} does not exist yet. If ${version} was just released, try again in a few minutes.`);
  }
  if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}`);
  return response;
}

async function download(url, file) {
  const response = await get(url);
  const total = Number(response.headers.get('content-length')) || 0;
  const hash = crypto.createHash('sha256');
  const out = fs.openSync(file, 'w');
  const isTty = process.stderr.isTTY;
  let received = 0;
  let shown = -1;
  try {
    for await (const chunk of response.body) {
      hash.update(chunk);
      fs.writeFileSync(out, chunk);
      received += chunk.byteLength;
      const step = total ? Math.floor((received * 100) / total) : Math.floor(received / 1048576);
      if (isTty && step !== shown) {
        shown = step;
        const percent = total ? ` ${step}%` : '';
        process.stderr.write(
          `\r\x1b[2Kfavo: downloading favo ${version}${percent} (${(received / 1048576).toFixed(1)} MB)`
        );
      }
    }
  } finally {
    fs.closeSync(out);
    if (isTty) process.stderr.write('\r\x1b[2K');
  }
  return hash.digest('hex');
}

function readBundledSums() {
  try {
    return fs.readFileSync(path.join(PackageRoot, 'SHA256SUMS'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function install(directory, asset) {
  const base = (setting('FAVO_RELEASE_BASE_URL') ?? DefaultReleaseBaseUrl).replace(/\/+$/, '');
  const bundledSums = readBundledSums();
  const sums = bundledSums ?? (await (await get(`${base}/v${version}/SHA256SUMS`)).text());
  const line = sums
    .split(/\r?\n/)
    .map((candidate) => ChecksumLine.exec(candidate.trim()))
    .find((match) => match?.[2] === asset);
  const source = bundledSums === undefined ? "the release's" : "this package's";
  if (!line) throw new Error(`${asset} is not listed in ${source} SHA256SUMS`);

  fs.mkdirSync(path.dirname(directory), { recursive: true });
  const staging = fs.mkdtempSync(`${directory}.staging-`);
  try {
    const archive = path.join(staging, asset);
    if ((await download(`${base}/v${version}/${asset}`, archive)) !== line[1].toLowerCase()) {
      throw new Error(`checksum mismatch for ${asset}`);
    }
    await pipeline(
      fs.createReadStream(archive),
      zlib.createGunzip(),
      fs.createWriteStream(path.join(staging, BinaryName), { mode: 0o755 })
    );
    fs.rmSync(archive);
    fs.writeFileSync(path.join(staging, CompletionMarker), `${version}\n`);
    publish(staging, directory);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function assertOwnFolder(directory) {
  if (!process.getuid) return;
  const entry = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (!entry) return;
  if (!entry.isSymbolicLink() && entry.uid === process.getuid()) return;
  const problem = entry.isSymbolicLink() ? 'is a symlink' : 'belongs to another user';
  throw new Error(
    `${directory} ${problem}, so favo won't run what's in it. Delete it, or set FAVO_HOME to a folder only you can write to.`
  );
}

function isComplete(directory) {
  assertOwnFolder(directory);
  try {
    const marker = fs.readFileSync(path.join(directory, CompletionMarker), 'utf8').trim();
    return marker === version && fs.existsSync(path.join(directory, BinaryName));
  } catch {
    return false;
  }
}

function publish(staging, directory) {
  try {
    fs.renameSync(staging, directory);
    return;
  } catch (error) {
    if (isComplete(directory)) return;
    if (!fs.existsSync(directory)) throw error;
  }
  const lock = `${directory}.lock`;
  try {
    fs.mkdirSync(lock);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(`another favo is installing ${version}. If none is running, delete ${lock} and try again.`, {
      cause: error,
    });
  }
  const stale = `${staging}.stale`;
  try {
    if (isComplete(directory)) return;
    fs.renameSync(directory, stale);
    try {
      fs.renameSync(staging, directory);
    } catch (error) {
      if (!isComplete(directory)) throw error;
    }
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
    fs.rmSync(stale, { recursive: true, force: true });
  }
}

function isOlderThanThisVersion(name) {
  const candidate = VersionPrefix.exec(name)?.[0];
  return candidate !== undefined && candidate.localeCompare(version, undefined, { numeric: true }) < 0;
}

function removeOlderVersions(runtime) {
  for (const name of fs.readdirSync(runtime).filter(isOlderThanThisVersion)) {
    try {
      fs.rmSync(path.join(runtime, name), { recursive: true, force: true });
    } catch {}
  }
}

function assertGlibc() {
  if (process.platform !== 'linux') return;
  if (process.report.getReport().header.glibcVersionRuntime) return;
  throw new Error("Alpine/musl isn't supported yet: favo's Linux builds need glibc.");
}

function run(binary) {
  const child = spawn(binary, process.argv.slice(2), {
    stdio: 'inherit',
    env: { ...process.env, FAVO_LAUNCHER: import.meta.filename, FAVO_LAUNCHER_NODE: process.execPath },
  });
  process.on('SIGINT', () => {});
  for (const signal of ForwardedSignals) process.on(signal, () => child.kill(signal));
  child.on('error', fail);
  child.on('exit', (code, signal) => process.exit(code ?? 128 + (os.constants.signals[signal] ?? 1)));
}

async function main() {
  const key = `${process.platform}-${process.arch}`;
  const asset = Assets[key];
  if (!asset) {
    throw new Error(`no favo build is available for ${key} (supported: ${Object.keys(Assets).join(', ')}).`);
  }
  const directory = path.join(favoHome(), 'runtime', version);
  if (!isComplete(directory)) {
    assertGlibc();
    await install(directory, asset);
    removeOlderVersions(path.dirname(directory));
  }
  run(path.join(directory, BinaryName));
}

function fail(error) {
  process.stderr.write(`favo: ${error.message}\n`);
  process.exit(1);
}

await main().catch(fail);
