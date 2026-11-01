import { describe, expect, it } from 'bun:test';
import { ownValue } from '#domain/shared/own-value';

describe('reading a record by a name someone else chose', () => {
  it('finds what the record holds', () => {
    expect(ownValue({ work: 'side' }, 'work')).toBe('side');
    expect(ownValue({ constructor: 'side' }, 'constructor')).toBe('side');
  });
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])('finds nothing for %s', (name) => {
    expect(ownValue({ work: 'side' }, name)).toBeUndefined();
  });
});
