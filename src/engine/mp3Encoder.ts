// MP3 encoding via @breezystack/lamejs — a pure-JS (no WASM) port of LAME,
// bundled at build time like every other dependency (offline-first: no
// runtime network fetch either way). Used by render.ts when the Export
// dialog's format is MP3.
import { Mp3Encoder } from '@breezystack/lamejs';
import type * as Tone from 'tone';

const SAMPLE_BLOCK_SIZE = 1152; // one MP3 frame's worth of samples per encodeBuffer call

function floatTo16BitPcm(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
}

function toInt16Array(channelData: Float32Array): Int16Array {
  const out = new Int16Array(channelData.length);
  for (let i = 0; i < channelData.length; i++) out[i] = floatTo16BitPcm(channelData[i]!);
  return out;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

/** Encodes a decoded audio buffer to MP3 bytes at the given bitrate (kbps, default 192). */
export function encodeMp3(buffer: Tone.ToneAudioBuffer, kbps = 192): Uint8Array<ArrayBuffer> {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const encoder = new Mp3Encoder(numChannels, buffer.sampleRate, kbps);
  const left = toInt16Array(buffer.getChannelData(0));
  const right = numChannels > 1 ? toInt16Array(buffer.getChannelData(1)) : undefined;

  const chunks: Uint8Array[] = [];
  for (let i = 0; i < left.length; i += SAMPLE_BLOCK_SIZE) {
    const leftChunk = left.subarray(i, i + SAMPLE_BLOCK_SIZE);
    const rightChunk = right?.subarray(i, i + SAMPLE_BLOCK_SIZE);
    const encoded = encoder.encodeBuffer(leftChunk, rightChunk);
    if (encoded.length > 0) chunks.push(encoded);
  }
  const finalChunk = encoder.flush();
  if (finalChunk.length > 0) chunks.push(finalChunk);

  return concatChunks(chunks);
}
