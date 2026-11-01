import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { FavoVersion } from '@favo/contracts/version';

describe('the npm package', () => {
  it('has the same version as the binary it downloads', () => {
    const { version } = JSON.parse(readFileSync(`${dirname(import.meta.dir)}/package.json`, 'utf8'));
    expect(version).toBe(FavoVersion);
  });
});
