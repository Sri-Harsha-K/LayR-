import { describe, expect, it } from 'vitest';
import { buildZip } from './zipWriter';
import { readZip } from './zipReader';

describe('readZip', () => {
  it('round-trips everything buildZip produces', () => {
    const zip = buildZip([
      { name: 'project.json', data: new TextEncoder().encode('{"name":"Test"}') },
      { name: 'audio/kick__user.wav', data: new Uint8Array([1, 2, 3, 4, 5]) },
    ]);

    const entries = readZip(zip);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.name).toBe('project.json');
    expect(new TextDecoder().decode(entries[0]!.data)).toBe('{"name":"Test"}');
    expect(entries[1]!.name).toBe('audio/kick__user.wav');
    expect(Array.from(entries[1]!.data)).toEqual([1, 2, 3, 4, 5]);
  });

  it('reads an empty archive', () => {
    expect(readZip(buildZip([]))).toEqual([]);
  });

  it('rejects a non-zip buffer', () => {
    expect(() => readZip(new Uint8Array([1, 2, 3, 4]))).toThrow(/not a valid .zip/i);
  });

  it('rejects a zip-slip entry name instead of handing a traversal path to callers', () => {
    const traversal = buildZip([{ name: '../../evil.txt', data: new Uint8Array([1]) }]);
    expect(() => readZip(traversal)).toThrow(/unsafe entry name/i);

    const absolute = buildZip([{ name: '/etc/passwd', data: new Uint8Array([1]) }]);
    expect(() => readZip(absolute)).toThrow(/unsafe entry name/i);

    const windowsDrive = buildZip([{ name: 'C:\\Windows\\evil.dll', data: new Uint8Array([1]) }]);
    expect(() => readZip(windowsDrive)).toThrow(/unsafe entry name/i);
  });
});
