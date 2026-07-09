import { describe, expect, it } from 'vitest';
import {
  BEATS_PER_BAR,
  PPQ,
  TICKS_PER_BAR,
  TICKS_PER_BEAT,
  TICKS_PER_SIXTEENTH,
  barsToTicks,
  clampBpm,
  clampSwing,
  formatBarsBeatsSixteenths,
  formatTicksAsPosition,
  patternLengthTicks,
  secondsToTicks,
  snapTicksDown,
  snapTicksNearest,
  stepOffsetTicks,
  ticksToBars,
  ticksToBarsBeatsSixteenths,
  ticksToSeconds,
  ticksToToneTime,
} from './time';

describe('constants', () => {
  it('derives sixteenth/beat/bar from PPQ for 4/4', () => {
    expect(PPQ).toBe(960);
    expect(TICKS_PER_SIXTEENTH).toBe(240);
    expect(TICKS_PER_BEAT).toBe(960);
    expect(BEATS_PER_BAR).toBe(4);
    expect(TICKS_PER_BAR).toBe(3840);
  });
});

describe('ticksToSeconds / secondsToTicks', () => {
  it('one quarter note at 120bpm is 0.5s', () => {
    expect(ticksToSeconds(TICKS_PER_BEAT, 120)).toBeCloseTo(0.5, 10);
  });

  it('one bar at 60bpm is 4s', () => {
    expect(ticksToSeconds(TICKS_PER_BAR, 60)).toBeCloseTo(4, 10);
  });

  it('one bar at 200bpm is 1.2s', () => {
    expect(ticksToSeconds(TICKS_PER_BAR, 200)).toBeCloseTo(1.2, 10);
  });

  it('round-trips seconds -> ticks -> seconds across the full BPM range', () => {
    for (const bpm of [40, 60, 90, 120, 128, 140, 174, 200, 240]) {
      for (const ticks of [0, 1, 240, 960, 3840, 123456]) {
        const seconds = ticksToSeconds(ticks, bpm);
        const backToTicks = secondsToTicks(seconds, bpm);
        expect(backToTicks).toBeCloseTo(ticks, 6);
      }
    }
  });
});

describe('bars/ticks', () => {
  it('converts bars to ticks and back', () => {
    expect(barsToTicks(1)).toBe(3840);
    expect(barsToTicks(4)).toBe(15360);
    expect(ticksToBars(3840)).toBe(1);
    expect(ticksToBars(7680)).toBe(2);
  });
});

describe('ticksToToneTime', () => {
  it('formats as Tone ticks notation', () => {
    expect(ticksToToneTime(0)).toBe('0i');
    expect(ticksToToneTime(1920)).toBe('1920i');
    expect(ticksToToneTime(1919.6)).toBe('1920i');
  });
});

describe('ticksToBarsBeatsSixteenths', () => {
  it('starts at bar 1 beat 1 sixteenth 1', () => {
    expect(ticksToBarsBeatsSixteenths(0)).toEqual({ bar: 1, beat: 1, sixteenth: 1 });
  });

  it('advances the sixteenth within beat 1', () => {
    expect(ticksToBarsBeatsSixteenths(240)).toEqual({ bar: 1, beat: 1, sixteenth: 2 });
    expect(ticksToBarsBeatsSixteenths(480)).toEqual({ bar: 1, beat: 1, sixteenth: 3 });
    expect(ticksToBarsBeatsSixteenths(720)).toEqual({ bar: 1, beat: 1, sixteenth: 4 });
  });

  it('rolls over into beat 2 at the quarter-note boundary', () => {
    expect(ticksToBarsBeatsSixteenths(960)).toEqual({ bar: 1, beat: 2, sixteenth: 1 });
  });

  it('rolls over into bar 2 at the bar boundary', () => {
    expect(ticksToBarsBeatsSixteenths(3840)).toEqual({ bar: 2, beat: 1, sixteenth: 1 });
  });

  it('handles an arbitrary position (bar 3, beat 3, sixteenth 3)', () => {
    // bar 3 => 2 full bars = 7680, beat 3 => 2 full beats = 1920, sixteenth 3 => 2 sixteenths = 480
    const ticks = 7680 + 1920 + 480;
    expect(ticksToBarsBeatsSixteenths(ticks)).toEqual({ bar: 3, beat: 3, sixteenth: 3 });
  });

  it('clamps negative ticks to the start position', () => {
    expect(ticksToBarsBeatsSixteenths(-100)).toEqual({ bar: 1, beat: 1, sixteenth: 1 });
  });
});

describe('formatBarsBeatsSixteenths / formatTicksAsPosition', () => {
  it('zero-pads bar to 3 digits and sixteenth to 2', () => {
    expect(formatBarsBeatsSixteenths({ bar: 1, beat: 1, sixteenth: 1 })).toBe('001:1:01');
    expect(formatBarsBeatsSixteenths({ bar: 12, beat: 3, sixteenth: 4 })).toBe('012:3:04');
    expect(formatBarsBeatsSixteenths({ bar: 128, beat: 4, sixteenth: 4 })).toBe('128:4:04');
  });

  it('formats directly from ticks', () => {
    expect(formatTicksAsPosition(0)).toBe('001:1:01');
    expect(formatTicksAsPosition(3840)).toBe('002:1:01');
  });
});

describe('patternLengthTicks', () => {
  it('16 steps is one bar, 32 steps is two bars', () => {
    expect(patternLengthTicks(16)).toBe(TICKS_PER_BAR);
    expect(patternLengthTicks(32)).toBe(TICKS_PER_BAR * 2);
  });
});

describe('stepOffsetTicks (swing)', () => {
  it('has no offset when swing is 0', () => {
    for (let i = 0; i < 16; i++) {
      expect(stepOffsetTicks(i, 0)).toBe(i * TICKS_PER_SIXTEENTH);
    }
  });

  it('leaves even (on-beat) steps untouched regardless of swing', () => {
    expect(stepOffsetTicks(0, 0.66)).toBe(0);
    expect(stepOffsetTicks(2, 0.66)).toBe(2 * TICKS_PER_SIXTEENTH);
    expect(stepOffsetTicks(4, 0.5)).toBe(4 * TICKS_PER_SIXTEENTH);
  });

  it('delays odd (off-beat) steps proportionally to swing', () => {
    expect(stepOffsetTicks(1, 0.5)).toBe(1 * TICKS_PER_SIXTEENTH + 0.5 * TICKS_PER_SIXTEENTH);
    expect(stepOffsetTicks(3, 0.66)).toBeCloseTo(3 * TICKS_PER_SIXTEENTH + 0.66 * TICKS_PER_SIXTEENTH, 10);
  });

  it('never pushes a swung step into the following step at max swing', () => {
    for (let i = 1; i < 16; i += 2) {
      const offset = stepOffsetTicks(i, 0.66);
      const nextStepBase = (i + 1) * TICKS_PER_SIXTEENTH;
      expect(offset).toBeLessThan(nextStepBase);
    }
  });
});

describe('clampSwing / clampBpm', () => {
  it('clamps swing to 0..0.66', () => {
    expect(clampSwing(-1)).toBe(0);
    expect(clampSwing(0.33)).toBeCloseTo(0.33);
    expect(clampSwing(2)).toBe(0.66);
  });

  it('clamps bpm to 40..240', () => {
    expect(clampBpm(0)).toBe(40);
    expect(clampBpm(120)).toBe(120);
    expect(clampBpm(9999)).toBe(240);
  });

  it('falls back to the default bpm for non-finite input', () => {
    expect(clampBpm(Number.NaN)).toBe(120);
    expect(clampBpm(Number.POSITIVE_INFINITY)).toBe(120);
  });

  it('keeps time conversion finite for bad bpm input', () => {
    expect(ticksToSeconds(TICKS_PER_BEAT, Number.NaN)).toBeCloseTo(0.5, 10);
    expect(secondsToTicks(0.5, Number.NaN)).toBeCloseTo(TICKS_PER_BEAT, 10);
  });
});

describe('snapTicksDown / snapTicksNearest', () => {
  it('snaps down to the resolution grid', () => {
    expect(snapTicksDown(500, TICKS_PER_SIXTEENTH)).toBe(480);
    expect(snapTicksDown(239, TICKS_PER_SIXTEENTH)).toBe(0);
  });

  it('snaps to the nearest grid point', () => {
    expect(snapTicksNearest(130, TICKS_PER_SIXTEENTH)).toBe(240);
    expect(snapTicksNearest(100, TICKS_PER_SIXTEENTH)).toBe(0);
  });
});
