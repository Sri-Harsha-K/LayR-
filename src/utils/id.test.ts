import { describe, expect, it } from 'vitest';
import { generateId } from './id';

describe('generateId', () => {
  it('prefixes the id', () => {
    expect(generateId('trk')).toMatch(/^trk_/);
  });

  it('produces unique ids across calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId('x')));
    expect(ids.size).toBe(1000);
  });
});
