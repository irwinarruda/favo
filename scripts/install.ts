import { copyFileSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { FavoVersion } from '@favo/contracts/version';

const home = homedir();
const isWindows = process.platform === 'win32';
const hostTarget = `${isWindows ? 'windows' : process.platform}-${process.arch}`;
const extension = isWindows ? '.exe' : '';
const root = process.env.FAVO_HOME || `${home}/.favo`;
const installed = `${root}/bin/favo${extension}`;
const assets = `${root}/assets`;
const versionedAssets = `${assets}/${FavoVersion}`;

mkdirSync(`${root}/bin`, { recursive: true });
mkdirSync(versionedAssets, { recursive: true });
rmSync(installed, { force: true });
copyFileSync(`dist/favo-${hostTarget}${extension}`, installed);
for (const entry of readdirSync(assets, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.startsWith('favo-')) rmSync(`${assets}/${entry.name}`);
}
for (const file of readdirSync('dist').filter((name) => name.startsWith('favo-'))) {
  copyFileSync(`dist/${file}`, `${versionedAssets}/${file}`);
}
if (isWindows || process.env.FAVO_HOME) {
  console.log(`favo is at ${installed}. Add its folder to your PATH.`);
} else {
  mkdirSync(`${home}/.local/bin`, { recursive: true });
  rmSync(`${home}/.local/bin/favo`, { force: true });
  symlinkSync(installed, `${home}/.local/bin/favo`);
  console.log('favo is at ~/.local/bin/favo');
}
