// PCM WAV byte writer. Tone.js ships no encoder (verified against the
// installed package's own .d.ts — ToneAudioBuffer has toMono/toArray/
// getChannelData, nothing WAV-shaped), so this is a small hand-rolled RIFF/
// WAVE writer: header + 16-bit interleaved samples. Used by both the
// recorded-sample/project-save path (projectIO.ts) and the offline bounce
// (render.ts).
import type * as Tone from 'tone';

const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

function floatTo16BitPcm(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

/** Encodes a decoded audio buffer as 16-bit PCM WAV bytes. */
export function encodeWav(buffer: Tone.ToneAudioBuffer): Uint8Array<ArrayBuffer> {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const channelData: Float32Array[] = Array.from({ length: numChannels }, (_, ch) =>
    buffer.getChannelData(ch),
  );

  const blockAlign = numChannels * BYTES_PER_SAMPLE;
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
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < numFrames; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      view.setInt16(offset, floatTo16BitPcm(channelData[ch]![frame]!), true);
      offset += BYTES_PER_SAMPLE;
    }
  }

  return bytes;
}
