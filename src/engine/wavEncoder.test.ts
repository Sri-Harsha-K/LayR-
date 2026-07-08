import { describe, expect, it } from 'vitest';
import { encodeWav } from './wavEncoder';
import type * as Tone from 'tone';

function fakeBuffer(channels: Float32Array[], sampleRate = 44100): Tone.ToneAudioBuffer {
  return {
    numberOfChannels: channels.length,
    sampleRate,
    length: channels[0]!.length,
    getChannelData: (ch: number) => channels[ch]!,
  } as unknown as Tone.ToneAudioBuffer;
}

function readString(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

describe('encodeWav', () => {
  it('writes a well-formed RIFF/WAVE header', () => {
    const buffer = fakeBuffer([new Float32Array([0, 0.5, -0.5, 1])], 48000);
    const bytes = encodeWav(buffer);
    const view = new DataView(bytes.buffer);

    expect(readString(bytes, 0, 4)).toBe('RIFF');
    expect(readString(bytes, 8, 4)).toBe('WAVE');
    expect(readString(bytes, 12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint16(34, true)).toBe(16); // bit depth
    expect(readString(bytes, 36, 4)).toBe('data');
  });

  it('sizes the byte length exactly for frames * channels * 2 bytes + 44-byte header', () => {
    const bytes = encodeWav(fakeBuffer([new Float32Array(10), new Float32Array(10)]));
    expect(bytes.length).toBe(44 + 10 * 2 * 2);
  });

  it('round-trips sample values through 16-bit PCM within quantization error', () => {
    const samples = new Float32Array([0, 0.25, -0.25, 1, -1]);
    const bytes = encodeWav(fakeBuffer([samples]));
    const view = new DataView(bytes.buffer);

    samples.forEach((expected, i) => {
      const raw = view.getInt16(44 + i * 2, true);
      const decoded = raw < 0 ? raw / 0x8000 : raw / 0x7fff;
      expect(decoded).toBeCloseTo(expected, 3);
    });
  });

  it('interleaves multi-channel samples', () => {
    const left = new Float32Array([1, -1]);
    const right = new Float32Array([-1, 1]);
    const bytes = encodeWav(fakeBuffer([left, right]));
    const view = new DataView(bytes.buffer);

    expect(view.getInt16(44, true)).toBeGreaterThan(0); // left[0] = 1
    expect(view.getInt16(46, true)).toBeLessThan(0); // right[0] = -1
    expect(view.getInt16(48, true)).toBeLessThan(0); // left[1] = -1
    expect(view.getInt16(50, true)).toBeGreaterThan(0); // right[1] = 1
  });
});
