import { describe, expect, it } from 'bun:test';
import { stripControlCharacters, stripControlCharactersDeep } from '#domain/shared/control-characters';

describe('control characters', () => {
  it('strips the whole C0 and C1 ranges, and DEL', () => {
    for (const code of [0x00, 0x07, 0x09, 0x0a, 0x0d, 0x1b, 0x1f, 0x7f, 0x80, 0x9b, 0x9f]) {
      expect(stripControlCharacters(`a${String.fromCharCode(code)}b`)).toBe('ab');
    }
  });
  it('keeps everything right beside those ranges', () => {
    const neighbours = '\u0020\u007e\u00a0\u00ff';
    expect(stripControlCharacters(neighbours)).toBe(neighbours);
  });
  it('keeps ordinary text from any language', () => {
    expect(stripControlCharacters('Olá, abelha 🐝 / C:\\Users')).toBe('Olá, abelha 🐝 / C:\\Users');
  });
  it('leaves an escape sequence as harmless text', () => {
    expect(stripControlCharacters('\u001b]0;title\u0007\u001b[2J\u009b31m')).toBe(']0;title[2J31m');
  });
  it('reaches every string in a parsed value, keys too', () => {
    const parsed = JSON.parse('{"a\\u001b":["b\\u0007",{"c":"d\\u009b"}],"n":1,"t":true,"z":null}');
    expect(stripControlCharactersDeep(parsed)).toEqual({ a: ['b', { c: 'd' }], n: 1, t: true, z: null });
  });
  it('does not let a parsed __proto__ key become a prototype', () => {
    const cleaned = stripControlCharactersDeep(JSON.parse('{"__proto__":{"isAdmin":"\\u001byes"}}')) as object;
    expect(Object.getPrototypeOf(cleaned)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(cleaned, '__proto__')?.value).toEqual({ isAdmin: 'yes' });
  });
});
