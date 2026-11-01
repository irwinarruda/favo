import { $ } from 'bun';

const Targets = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64', 'windows-x64'];
const NoFolderAutoload = [
  '--no-compile-autoload-dotenv',
  '--no-compile-autoload-bunfig',
  '--no-compile-autoload-tsconfig',
  '--no-compile-autoload-package-json',
];
const isAll = process.argv.includes('--all');
const isMac = process.platform === 'darwin';
const hostSystem = process.platform === 'win32' ? 'windows' : process.platform;
const hostTarget = `${hostSystem}-${process.arch}`;
const extensionOf = (target: string) => (target.startsWith('windows') ? '.exe' : '');
const bunTargetOf = (target: string) => (target.endsWith('-x64') ? `bun-${target}-baseline` : `bun-${target}`);
const targets = isAll ? Targets : [hostTarget];
const unsigned: string[] = [];

await $`mkdir -p dist`;
for (const target of targets) {
  const outfile = `dist/favo-${target}${extensionOf(target)}`;
  const compiled =
    await $`bun build --compile ${NoFolderAutoload} --target=${bunTargetOf(target)} --outfile=${outfile} apps/cli/src/main.ts`
      .quiet()
      .nothrow();
  if (compiled.exitCode !== 0) {
    console.error(compiled.stderr.toString());
    throw new Error(`${target} did not compile. Building every target needs: bun install --os='*' --cpu='*'`);
  }
  if (target.startsWith('darwin')) {
    if (isMac) {
      await $`codesign --remove-signature ${outfile}`.quiet();
      await $`codesign --force --sign - ${outfile}`.quiet();
      await $`codesign --verify --strict ${outfile}`.quiet();
    } else {
      unsigned.push(outfile);
    }
  }
  console.log(`built ${outfile}`);
}
await $`cp dist/favo-${hostTarget}${extensionOf(hostTarget)} dist/favo${extensionOf(hostTarget)}`;
if (unsigned.length > 0) {
  console.log(`note: ${unsigned.join(' and ')} built off macOS, so codesign never ran. Do not release these.`);
}
