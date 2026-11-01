import { chmodSync, writeFileSync } from 'node:fs';

const FakeScript = `${import.meta.dir}/fake.ts`;
const Names = ['claude', 'codex', 'agy', 'opencode', 'ssh', 'scp'];

export function installFakes(directory: string) {
  for (const name of Names) {
    if (process.platform === 'win32') {
      writeFileSync(`${directory}/${name}.cmd`, `@bun "${FakeScript}" ${name} %*\r\n`);
      continue;
    }
    writeFileSync(`${directory}/${name}`, `#!/bin/sh\nexec bun "${FakeScript}" ${name} "$@"\n`);
    chmodSync(`${directory}/${name}`, 0o755);
  }
}
