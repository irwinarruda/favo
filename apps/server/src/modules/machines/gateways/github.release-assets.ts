import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { assertDomain, DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { ReleaseAssets } from '@/modules/machines/gateways/release-assets';

const ReleaseBaseUrl = 'https://github.com/irwinarruda/favo/releases/download';
const ChecksumsFile = 'SHA256SUMS';
const ChecksumLine = /^([0-9a-fA-F]{64}) {2}(.+)$/;
const ChecksumsTimeoutMs = 30_000;
const AssetTimeoutMs = 300_000;
const NotFoundStatus = 404;
const ExecutableMode = 0o755;

export class GithubReleaseAssets extends ReleaseAssets {
  constructor(
    private readonly baseUrl = ReleaseBaseUrl,
    private readonly assetTimeoutMs = AssetTimeoutMs
  ) {
    super();
  }

  async download(assetName: string, version: string, destination: string) {
    const packedName = `${assetName}.gz`;
    const checksums = await this.fetchFile(ChecksumsFile, version, ChecksumsTimeoutMs);
    assertDomain(
      checksums,
      DomainErrorCode.assetMissing,
      `favo ${version} has no published release, so there is no ${assetName} to download. From source, run: bun run build:all && bun run install:local`
    );
    const expected = checksumOf(checksums.toString(), packedName);
    assertDomain(expected, DomainErrorCode.assetMissing, `The favo ${version} release does not list ${packedName}.`);
    const packed = await this.fetchFile(packedName, version, this.assetTimeoutMs);
    assertDomain(packed, DomainErrorCode.assetMissing, `The favo ${version} release lists ${packedName} but lacks it.`);
    const actual = createHash('sha256').update(packed).digest('hex');
    assertDomain(
      actual === expected,
      DomainErrorCode.assetMissing,
      `${packedName} (favo ${version}) failed its checksum.`
    );
    const binary = await promisify(gunzip)(packed).catch((error) => {
      throw new DomainError(
        DomainErrorCode.assetMissing,
        `${packedName} (favo ${version}) is corrupt: ${reasonOf(error)}`
      );
    });
    await writeExecutable(binary, destination).catch((error) => {
      throw new DomainError(
        DomainErrorCode.assetMissing,
        `Could not save ${assetName} (favo ${version}): ${reasonOf(error)}`
      );
    });
  }

  private async fetchFile(file: string, version: string, timeoutMs: number) {
    try {
      const url = `${this.baseUrl}/v${version}/${file}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), decompress: false });
      if (response.status === NotFoundStatus) return undefined;
      if (!response.ok) throw new Error(`the server answered ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      throw new DomainError(
        DomainErrorCode.assetMissing,
        `Could not download ${file} (favo ${version}): ${reasonOf(error)}`
      );
    }
  }
}

function checksumOf(checksums: string, fileName: string) {
  for (const line of checksums.split('\n')) {
    const [, checksum, name] = ChecksumLine.exec(line.trim()) ?? [];
    if (name === fileName) return checksum!.toLowerCase();
  }
  return undefined;
}

async function writeExecutable(binary: Uint8Array, destination: string) {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(temporary, binary, { mode: ExecutableMode });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function reasonOf(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  return error.name === 'TimeoutError' ? 'it timed out' : error.message;
}
