import { describe, expect, it } from 'vitest';
import { buildSpeedWarp } from './speedAutomation';
import { MAX_SPEED } from './speed';

const BAR = 3840;

describe('buildSpeedWarp — constant (no keyframes) reproduces the old divide', () => {
  it('is identity at speed 1', () => {
    const warp = buildSpeedWarp({ clipScalarSpeed: 1, outerSpeed: 1, domainTicks: BAR });
    expect(warp(0)).toBe(0);
    expect(warp(960)).toBe(960);
    expect(warp(BAR)).toBe(BAR);
  });

  it('divides by the clip scalar', () => {
    const warp = buildSpeedWarp({ clipScalarSpeed: 2, outerSpeed: 1, domainTicks: BAR });
    expect(warp(BAR)).toBe(BAR / 2);
    expect(warp(480)).toBe(240);
  });

  it('folds in the outer (track/scene) multiplier, clamped to MAX', () => {
    // 2 * 4 = 8 -> clamped to MAX_SPEED, matching effectiveSpeed's product clamp.
    const warp = buildSpeedWarp({ clipScalarSpeed: 2, outerSpeed: 4, domainTicks: BAR });
    expect(warp(BAR)).toBe(BAR / MAX_SPEED);
  });
});

describe('buildSpeedWarp — speed curve', () => {
  it('a flat curve behaves like a constant of that value (and ignores the scalar)', () => {
    const warp = buildSpeedWarp({
      speedKeyframes: [
        { ticks: 0, value: 2 },
        { ticks: BAR, value: 2 },
      ],
      clipScalarSpeed: 4, // ignored because a curve is present
      outerSpeed: 1,
      domainTicks: BAR,
    });
    expect(warp(BAR)).toBeCloseTo(BAR / 2, 3);
  });

  it('is monotonic increasing and matches the analytic integral for a linear ramp 1x -> 2x', () => {
    const warp = buildSpeedWarp({
      speedKeyframes: [
        { ticks: 0, value: 1 },
        { ticks: BAR, value: 2 },
      ],
      outerSpeed: 1,
      domainTicks: BAR,
    });
    // ∫₀^BAR du / (1 + u/BAR) = BAR * ln(2)
    expect(Math.abs(warp(BAR) - BAR * Math.LN2)).toBeLessThan(2);
    // Monotonic across the bar.
    let prev = -1;
    for (let t = 0; t <= BAR; t += 240) {
      const w = warp(t);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
    // Faster-than-1 everywhere after the start, so total output time < identity.
    expect(warp(BAR)).toBeLessThan(BAR);
  });

  it('clamps out-of-range curve values to the engine speed bounds', () => {
    const warp = buildSpeedWarp({
      speedKeyframes: [
        { ticks: 0, value: 100 },
        { ticks: BAR, value: 100 },
      ],
      outerSpeed: 1,
      domainTicks: BAR,
    });
    // 100 -> clamped to MAX_SPEED, so the bar compresses to BAR/MAX.
    expect(warp(BAR)).toBeCloseTo(BAR / MAX_SPEED, 3);
  });

  it('extrapolates past the domain at the boundary rate (for note tails)', () => {
    const warp = buildSpeedWarp({
      speedKeyframes: [
        { ticks: 0, value: 2 },
        { ticks: BAR, value: 2 },
      ],
      outerSpeed: 1,
      domainTicks: BAR,
    });
    // One extra bar of content at speed 2 adds BAR/2 of output time.
    expect(warp(BAR * 2)).toBeCloseTo(BAR, 2);
  });
});
