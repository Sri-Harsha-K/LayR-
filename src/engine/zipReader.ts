// Companion reader for zipWriter.ts's STORE-only .zip format — used by
// browser.ts's Firefox/Safari fallback to read back a project bundle
// saved via the same format (see zipWriter.ts's own header for why STORE
// needs no deflate implementation either way).
import type { ZipEntry } from './zipWriter';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT_SIZE = 0xffff;

function findEndOfCentralDirectory(view: DataView, length: number): number {
  const searchStart = Math.max(0, length - EOCD_MIN_SIZE - MAX_COMMENT_SIZE);
  for (let pos = length - EOCD_MIN_SIZE; pos >= searchStart; pos--) {
    if (view.getUint32(pos, true) === EOCD_SIGNATURE) return pos;
  }
  throw new Error('Not a valid .zip file (no end-of-central-directory record found).');
}

/** Reads every entry out of a STORE-only .zip produced by zipWriter.ts. Throws on any entry using real compression — this reader only ever needs to round-trip our own output. */
export function readZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view, bytes.length);
  const totalRecords = view.getUint16(eocdOffset + 10, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);

  const entries: ZipEntry[] = [];
  let pos = centralOffset;
  for (let i = 0; i < totalRecords; i++) {
    if (view.getUint32(pos, true) !== CENTRAL_SIGNATURE) {
      throw new Error('Corrupt .zip central directory.');
    }
    const method = view.getUint16(pos + 10, true);
    if (method !== 0) throw new Error('This .zip uses compression this reader does not support.');
    const size = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localHeaderOffset = view.getUint32(pos + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nameLen));

    if (view.getUint32(localHeaderOffset, true) !== LOCAL_SIGNATURE) {
      throw new Error('Corrupt .zip local file header.');
    }
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    entries.push({ name, data: bytes.slice(dataStart, dataStart + size) });

    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
