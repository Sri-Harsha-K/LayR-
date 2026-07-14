import { describe, expect, it } from 'vitest';
import { clampSpeed, DEFAULT_SPEED, effectiveSpeed, MAX_SPEED, MIN_SPEED } from './speed';

describe('clampSpeed', () => {
  it('passes through a value already in range', () => {
    expect(clampSpeed(1.5)).toBe(1.5);
    expect(clampSpeed(MIN_SPEED)).toBe(MIN_SPEED);
    expect(clampSpeed(MAX_SPEED)).toBe(MAX_SPEED);
  });

  it('clamps below MIN and above MAX to the bounds', () => {
    expect(clampSpeed(0.01)).toBe(MIN_SPEED);
    expect(clampSpeed(100)).toBe(MAX_SPEED);
  });

  it('falls back to 1.0 for non-finite input (NaN/Infinity), never handing Tone a bad rate', () => {
    expect(clampSpeed(NaN)).toBe(DEFAULT_SPEED);
    expect(clampSpeed(Infinity)).toBe(DEFAULT_SPEED);
    expect(clampSpeed(-Infinity)).toBe(DEFAULT_SPEED);
  });
});

describe('effectiveSpeed', () => {
  it('is 1.0 when no levels (or only undefined levels) apply', () => {
    expect(effectiveSpeed()).toBe(DEFAULT_SPEED);
    expect(effectiveSpeed(undefined)).toBe(DEFAULT_SPEED);
    expect(effectiveSpeed(undefined, undefined, undefined)).toBe(DEFAULT_SPEED);
  });

  it('treats an undefined level as a 1.0 no-op', () => {
    expect(effectiveSpeed(2, undefined)).toBe(2);
    expect(effectiveSpeed(undefined, 1.5, undefined)).toBe(1.5);
  });

  it('multiplies the levels that do apply', () => {
    expect(effectiveSpeed(2, 1.5)).toBe(3);
    expect(effectiveSpeed(2, undefined, 1.5)).toBe(3);
    expect(effectiveSpeed(0.5, 0.5)).toBe(0.25);
  });

  it('clamps each level before multiplying, then clamps the product to MIN..MAX', () => {
    // 4 * 4 = 16 -> clamped to MAX, so two maxed levels can never drive a
    // pathological playbackRate / loop length.
    expect(effectiveSpeed(4, 4)).toBe(MAX_SPEED);
    // Each level individually clamped first: 100 -> 4, then 4 * 1 -> 4.
    expect(effectiveSpeed(100)).toBe(MAX_SPEED);
    // 0.25 * 0.25 = 0.0625 -> clamped up to MIN.
    expect(effectiveSpeed(0.25, 0.25)).toBe(MIN_SPEED);
  });

  it('ignores non-finite levels (each degrades to 1.0)', () => {
    expect(effectiveSpeed(NaN, 2)).toBe(2);
    expect(effectiveSpeed(Infinity)).toBe(DEFAULT_SPEED);
  });
});
