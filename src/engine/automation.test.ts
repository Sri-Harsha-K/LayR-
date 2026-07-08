import { describe, expect, it } from 'vitest';
import { sampleVolumeAtTick, sortKeyframes } from './automation';

describe('sortKeyframes', () => {
  it('sorts by ticks ascending without mutating the input', () => {
    const input = [
      { ticks: 500, value: 0.2 },
      { ticks: 0, value: 1 },
      { ticks: 250, value: 0.5 },
    ];
    const sorted = sortKeyframes(input);
    expect(sorted.map((k) => k.ticks)).toEqual([0, 250, 500]);
    expect(input[0]!.ticks).toBe(500); // original untouched
  });
});

describe('sampleVolumeAtTick', () => {
  it('returns 1 when there are no keyframes', () => {
    expect(sampleVolumeAtTick(undefined, 100)).toBe(1);
    expect(sampleVolumeAtTick([], 100)).toBe(1);
  });

  it('holds the first keyframe value before it', () => {
    const kfs = [{ ticks: 480, value: 0.4 }, { ticks: 960, value: 1 }];
    expect(sampleVolumeAtTick(kfs, 0)).toBe(0.4);
    expect(sampleVolumeAtTick(kfs, 480)).toBe(0.4);
  });

  it('holds the last keyframe value after it', () => {
    const kfs = [{ ticks: 0, value: 1 }, { ticks: 480, value: 0.3 }];
    expect(sampleVolumeAtTick(kfs, 1000)).toBe(0.3);
  });

  it('linearly interpolates between two keyframes regardless of input order', () => {
    const kfs = [{ ticks: 960, value: 0 }, { ticks: 0, value: 1 }];
    expect(sampleVolumeAtTick(kfs, 480)).toBeCloseTo(0.5);
    expect(sampleVolumeAtTick(kfs, 240)).toBeCloseTo(0.75);
  });

  it('interpolates across the correct segment with more than two keyframes', () => {
    const kfs = [
      { ticks: 0, value: 0 },
      { ticks: 480, value: 1 },
      { ticks: 960, value: 0.5 },
    ];
    expect(sampleVolumeAtTick(kfs, 240)).toBeCloseTo(0.5);
    expect(sampleVolumeAtTick(kfs, 720)).toBeCloseTo(0.75);
  });

  it('a single keyframe acts as a flat gain override', () => {
    expect(sampleVolumeAtTick([{ ticks: 400, value: 0.6 }], 0)).toBe(0.6);
    expect(sampleVolumeAtTick([{ ticks: 400, value: 0.6 }], 9999)).toBe(0.6);
  });
});
