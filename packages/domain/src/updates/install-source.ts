import type { ValueOf } from '#domain/shared/value-of';

export const FavoPackage = 'favo-cli';

export const InstallMethod = {
  homebrew: 'homebrew',
  npm: 'npm',
  pnpm: 'pnpm',
  yarn: 'yarn',
  bun: 'bun',
} as const;
export type InstallMethod = ValueOf<typeof InstallMethod>;

export type InstallSource = {
  method: InstallMethod;
  packageName: string;
  root: string;
  isCask: boolean;
};

export const PackageManagers: Record<InstallMethod, string> = {
  homebrew: 'brew',
  npm: 'npm',
  pnpm: 'pnpm',
  yarn: 'yarn',
  bun: 'bun',
};

const HomebrewPath = /^(.*)\/(Cellar|Caskroom)\/([^/]+)\//;
const NodePackagePath = /^(.*?)(?:\/lib)?\/node_modules\/(@[^/]+\/[^/]+|[^/]+)\//;
const GlobalNodeFolders: [RegExp, InstallMethod][] = [
  [/\/\.bun\/install\/global\//, InstallMethod.bun],
  [/\/pnpm\/global\//i, InstallMethod.pnpm],
  [/\/yarn\/(?:data\/)?global\//i, InstallMethod.yarn],
  [/\/(?:lib|npm|nodejs|installation|v\d[^/]*)\/node_modules\//, InstallMethod.npm],
];
const ShimTarget = /(?:%dp0%|%~dp0|\$basedir)[\\/]+([^"\s]*node_modules[\\/][^"\s]+)/;

export function installSourceOf(realPath: string): InstallSource | undefined {
  const path = realPath.replaceAll('\\', '/');
  const homebrew = HomebrewPath.exec(path);
  if (homebrew) {
    const [, root, shelf, packageName] = homebrew;
    return { method: InstallMethod.homebrew, packageName: packageName!, root: root!, isCask: shelf === 'Caskroom' };
  }
  const nodePackage = NodePackagePath.exec(path);
  const method = GlobalNodeFolders.find(([folder]) => folder.test(path))?.[1];
  if (!nodePackage || !method) return undefined;
  return { method, packageName: nodePackage[2]!, root: nodePackage[1]!, isCask: false };
}

export function shimTargetOf(shimPath: string, head: string) {
  const target = ShimTarget.exec(head)?.[1];
  if (!target) return undefined;
  return `${shimPath.replaceAll('\\', '/').replace(/\/[^/]*$/, '')}/${target.replaceAll('\\', '/')}`;
}

export function upgradeArgumentsOf({ method, packageName, isCask }: InstallSource) {
  const latest = `${packageName}@latest`;
  if (method === InstallMethod.homebrew) return ['upgrade', isCask ? '--cask' : '--formula', packageName];
  if (method === InstallMethod.yarn) return ['global', 'add', latest];
  if (method === InstallMethod.npm) return ['install', '--global', latest];
  return ['add', '--global', latest];
}

export function installLabelOf({ method, packageName, root, isCask }: InstallSource) {
  if (method === InstallMethod.homebrew) return `Homebrew ${isCask ? 'cask' : 'formula'} ${packageName}`;
  return method === InstallMethod.npm ? `npm in ${root}` : method;
}
