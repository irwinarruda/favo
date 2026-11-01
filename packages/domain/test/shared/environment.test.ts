import { describe, expect, it } from 'bun:test';
import { mergeEnvironment } from '#domain/shared/environment';

describe('mergeEnvironment', () => {
  it('replaces Path with PATH on Windows, where names ignore case', () => {
    const env = mergeEnvironment({ base: { Path: 'old' }, overrides: { PATH: 'new' }, isCaseInsensitive: true });
    expect(env).toEqual({ PATH: 'new' });
  });
  it('keeps both on Unix, where they are different names', () => {
    const env = mergeEnvironment({ base: { Path: 'old' }, overrides: { PATH: 'new' }, isCaseInsensitive: false });
    expect(env).toEqual({ Path: 'old', PATH: 'new' });
  });
  it('unsets names and drops undefined values', () => {
    const env = mergeEnvironment({
      base: { TMUX: '/t', HOME: '/h', EMPTY: undefined },
      unset: ['TMUX'],
      isCaseInsensitive: false,
    });
    expect(env).toEqual({ HOME: '/h' });
  });
});
