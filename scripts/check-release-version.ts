import { FavoVersion } from '@favo/contracts/version';

const tag = process.argv[2];
const { version: npmVersion } = await Bun.file('apps/npm/package.json').json();
const changelog = await Bun.file('CHANGELOG.md').text();

if (tag !== `v${npmVersion}` || tag !== `v${FavoVersion}`) {
  console.error(`Tag ${tag} needs apps/npm/package.json (${npmVersion}) and FavoVersion (${FavoVersion}) to match it.`);
  process.exit(1);
}
if (!changelog.includes(`\n## [${FavoVersion}] - `)) {
  console.error(`CHANGELOG.md needs a "## [${FavoVersion}] - YYYY-MM-DD" section for ${tag}.`);
  process.exit(1);
}
console.log(`${tag} matches apps/npm/package.json, FavoVersion and CHANGELOG.md`);
