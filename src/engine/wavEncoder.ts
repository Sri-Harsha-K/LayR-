// PCM WAV byte writer. Tone.js ships no encoder (verified against the
// installed package's own .d.ts — ToneAudioBuffer has toMono/toArray/
// getChannelData, nothing WAV-shaped), so this is a small hand-rolled RIFF/
// WAVE writer: header + 16-bit interleaved samples. Used by both the
// recorded-sample/project-save path (projectIO.ts) and the offline bounce
// (render.ts).
import type * as Tone from 'tone';

export type WavBitDepth = 16 | 24;

function floatToInt(sample: number, maxValue: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return Math.round(clamped < 0 ? clamped * (maxValue + 1) : clamped * maxValue);
}

// DataView has no setInt24 — three bytes written by hand, little-endian,
// two's-complement (matches setInt16/setInt32's own byte order).
function writeInt24LE(view: DataView, offset: number, value: number): void {
  view.setUint8(offset, value & 0xff);
  view.setUint8(offset + 1, (value >> 8) & 0xff);
  view.setUint8(offset + 2, (value >> 16) & 0xff);
}

/** Encodes a decoded audio buffer as PCM WAV bytes at the given bit depth (16, the long-standing default, or 24). */
export function encodeWav(buffer: Tone.ToneAudioBuffer, bitDepth: WavBitDepth = 16): Uint8Array<ArrayBuffer> {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const channelData: Float32Array[] = Array.from({ length: numChannels }, (_, ch) =>
    buffer.getChannelData(ch),
  );

  const bytesPerSample = bitDepth / 8;
  const maxValue = 2 ** (bitDepth - 1) - 1;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < numFrames; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const intSample = floatToInt(channelData[ch]![frame]!, maxValue);
      if (bitDepth === 16) view.setInt16(offset, intSample, true);
      else writeInt24LE(view, offset, intSample);
      offset += bytesPerSample;
    }
  }

  return bytes;
}
