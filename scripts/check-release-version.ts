import { FavoVersion } from '@favo/contracts/version';

const tag = process.argv[2];
const { version: npmVersion } = await Bun.file('apps/npm/package.json').json();

if (tag !== `v${npmVersion}` || tag !== `v${FavoVersion}`) {
  console.error(`Tag ${tag} needs apps/npm/package.json (${npmVersion}) and FavoVersion (${FavoVersion}) to match it.`);
  process.exit(1);
}
console.log(`${tag} matches apps/npm/package.json and FavoVersion`);
