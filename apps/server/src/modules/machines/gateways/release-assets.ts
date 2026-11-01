export abstract class ReleaseAssets {
  abstract download(assetName: string, version: string, destination: string): Promise<void>;
}
