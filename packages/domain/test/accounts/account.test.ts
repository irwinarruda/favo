import { describe, expect, it } from 'bun:test';
import { assertAccountName, isPersonalAccount, seatHomeOf } from '#domain/accounts/account';

const paths = { home: '/Users/bee', accounts: '/Users/bee/.favo/accounts' };

describe('accounts', () => {
  it('accepts a short lowercase name', () => {
    expect(() => assertAccountName('work')).not.toThrow();
    expect(() => assertAccountName('side-2')).not.toThrow();
  });
  it('refuses names that would make a bad folder', () => {
    for (const name of ['', 'Work', '1side', 'a b', '../up', 'a/b', 'x'.repeat(33)]) {
      expect(() => assertAccountName(name)).toThrow();
    }
  });
  it('reserves personal for the labs own folders', () => {
    expect(() => assertAccountName('personal')).toThrow('reserved');
  });
  it('puts a managed seat under accounts', () => {
    expect(seatHomeOf(paths, 'work', 'claude')).toBe('/Users/bee/.favo/accounts/work/claude');
  });
  it('puts the personal seat at the provider own folder', () => {
    expect(isPersonalAccount('personal')).toBe(true);
    expect(seatHomeOf(paths, 'personal', 'claude')).toBe('/Users/bee/.claude');
    expect(seatHomeOf(paths, 'personal', 'antigravity')).toBe('/Users/bee/.gemini/antigravity-cli');
  });
});
