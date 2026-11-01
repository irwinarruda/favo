import { describe, expect, test } from 'bun:test';
import { composeServices } from '@/libs/zustand';

describe('composeServices', () => {
  test('refuses two services publishing the same key', () => {
    expect(() => composeServices({ a: 1 }, { a: 2 })).toThrow('Duplicate service key: a');
  });
});
