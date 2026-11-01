import { chmodSync, writeFileSync } from 'node:fs';

const FakeScript = `${import.meta.dir}/fake.ts`;
const Main = `${import.meta.dir}/../../../src/main.ts`;
const Names = ['claude', 'codex', 'agy', 'opencode', 'ssh', 'scp', 'herdr'];

export function installFakes(directory: string) {
  if (process.platform === 'win32') writeFileSync(`${directory}/favo.cmd`, `@bun "${Main}" %*\r\n`);
  else {
    writeFileSync(`${directory}/favo`, `#!/bin/sh\nexec bun "${Main}" "$@"\n`);
    chmodSync(`${directory}/favo`, 0o755);
  }
  for (const name of Names) {
    if (process.platform === 'win32') {
      writeFileSync(`${directory}/${name}.cmd`, `@bun "${FakeScript}" ${name} %*\r\n`);
      continue;
    }
    writeFileSync(`${directory}/${name}`, `#!/bin/sh\nexec bun "${FakeScript}" ${name} "$@"\n`);
    chmodSync(`${directory}/${name}`, 0o755);
  }
}
