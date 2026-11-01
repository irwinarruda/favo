const tag = process.argv[2];
const version = tag?.replace(/^v/, '');
const heading = `## [${version}] - `;
const changelog = await Bun.file('CHANGELOG.md').text();

const section = changelog.split(/^(?=## \[|\[[^\]]+\]: )/m).find((part) => part.startsWith(heading));
const notes = section?.slice(section.indexOf('\n')).trim();

if (!notes) {
  console.error(`CHANGELOG.md needs a "## [${version}] - YYYY-MM-DD" section with entries for ${tag}.`);
  process.exit(1);
}
console.log(notes);
