import { FavoVersion } from '@favo/contracts/version';

export type FavoPaths = ReturnType<typeof favoPathsOf>;

export function favoPathsOf(input: { home: string; favoHome?: string; configHome?: string; isWindows: boolean }) {
  const root = input.favoHome ?? `${input.home}/.favo`;
  return {
    isWindows: input.isWindows,
    home: input.home,
    configHome: input.configHome ?? `${input.home}/.config`,
    root,
    accounts: `${root}/accounts`,
    threads: `${root}/threads`,
    trash: `${root}/trash`,
    assets: `${root}/assets`,
    versionedAssets: `${root}/assets/${FavoVersion}`,
    themes: `${root}/themes`,
    emptyFolder: `${root}/empty`,
    machinesFile: `${root}/machines.json`,
    configFile: `${root}/config.json`,
  };
}
