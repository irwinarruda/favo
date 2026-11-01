import { FavoVersion } from '@favo/contracts/version';

export type FavoPaths = ReturnType<typeof favoPathsOf>;

export function favoPathsOf(input: { home: string; favoHome?: string; isWindows: boolean }) {
  const root = input.favoHome ?? `${input.home}/.favo`;
  return {
    isWindows: input.isWindows,
    home: input.home,
    root,
    accounts: `${root}/accounts`,
    trash: `${root}/trash`,
    assets: `${root}/assets`,
    versionedAssets: `${root}/assets/${FavoVersion}`,
    themes: `${root}/themes`,
    machinesFile: `${root}/machines.json`,
    configFile: `${root}/config.json`,
  };
}
