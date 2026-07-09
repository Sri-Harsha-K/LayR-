import { describe, expect, it } from 'vitest';
import { buildZip } from './zipWriter';

// No zip library is available to cross-check against in this environment,
// so this test acts as its own minimal reader: walks the central directory
// this writer just produced and confirms it can recover exactly what went
// in (name, size, and raw bytes via each entry's local header offset).
function readEntries(zip: Uint8Array): { name: string; data: Uint8Array }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // End of central directory is the last 22 bytes for a zip with no comment.
  const eocdOffset = zip.length - 22;
  expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);
  const totalRecords = view.getUint16(eocdOffset + 10, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);

  const results: { name: string; data: Uint8Array }[] = [];
  let pos = centralOffset;
  for (let i = 0; i < totalRecords; i++) {
    expect(view.getUint32(pos, true)).toBe(0x02014b50);
    const crc = view.getUint32(pos + 16, true);
    const size = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const localHeaderOffset = view.getUint32(pos + 42, true);
    const name = new TextDecoder().decode(zip.subarray(pos + 46, pos + 46 + nameLen));

    expect(view.getUint32(localHeaderOffset, true)).toBe(0x04034b50);
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const dataStart = localHeaderOffset + 30 + localNameLen;
    const data = zip.subarray(dataStart, dataStart + size);

    // Sanity-check the CRC the writer stored against the bytes it actually wrote.
    let c = 0xffffffff;
    for (let b = 0; b < data.length; b++) {
      c = c ^ data[b]!;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    expect((c ^ 0xffffffff) >>> 0).toBe(crc);

    results.push({ name, data });
    pos += 46 + nameLen;
  }
  return results;
}

describe('buildZip', () => {
  it('round-trips multiple entries with correct names, sizes, and bytes', () => {
    const a = new TextEncoder().encode('drums track render');
    const b = new TextEncoder().encode('bass track render, a bit longer than the first one');
    const zip = buildZip([
      { name: 'Drums.wav', data: a },
      { name: 'Bass.wav', data: b },
    ]);

    const entries = readEntries(zip);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.name).toBe('Drums.wav');
    expect(new TextDecoder().decode(entries[0]!.data)).toBe('drums track render');
    expect(entries[1]!.name).toBe('Bass.wav');
    expect(new TextDecoder().decode(entries[1]!.data)).toBe('bass track render, a bit longer than the first one');
  });

  it('produces a valid (empty) archive for zero entries', () => {
    const zip = buildZip([]);
    expect(readEntries(zip)).toHaveLength(0);
  });
});
