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

  describe('spline curve', () => {
    it('still passes exactly through every keyframe', () => {
      const kfs = [
        { ticks: 0, value: 0.2 },
        { ticks: 480, value: 1 },
        { ticks: 960, value: 0.5 },
      ];
      expect(sampleVolumeAtTick(kfs, 0, 'spline')).toBeCloseTo(0.2);
      expect(sampleVolumeAtTick(kfs, 480, 'spline')).toBeCloseTo(1);
      expect(sampleVolumeAtTick(kfs, 960, 'spline')).toBeCloseTo(0.5);
    });

    it('stays clamped to 0..1 even where Catmull-Rom would overshoot', () => {
      const kfs = [
        { ticks: 0, value: 0 },
        { ticks: 240, value: 0.95 },
        { ticks: 480, value: 1 },
        { ticks: 720, value: 0.05 },
        { ticks: 960, value: 0 },
      ];
      for (let t = 0; t <= 960; t += 30) {
        const v = sampleVolumeAtTick(kfs, t, 'spline');
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it('matches linear on a straight two-keyframe run (no curvature to differ)', () => {
      const kfs = [{ ticks: 0, value: 0 }, { ticks: 960, value: 1 }];
      expect(sampleVolumeAtTick(kfs, 480, 'spline')).toBeCloseTo(sampleVolumeAtTick(kfs, 480, 'linear'));
    });

    it('produces a different midpoint than linear once there are 3+ keyframes shaping the curve', () => {
      const kfs = [
        { ticks: 0, value: 0 },
        { ticks: 480, value: 1 },
        { ticks: 960, value: 0 },
      ];
      const linearMid = sampleVolumeAtTick(kfs, 240, 'linear');
      const splineMid = sampleVolumeAtTick(kfs, 240, 'spline');
      expect(splineMid).not.toBeCloseTo(linearMid, 1);
    });
  });
});
