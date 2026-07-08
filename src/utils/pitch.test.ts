import { describe, expect, it } from 'vitest';
import { isBlackKey, isC, midiToNoteName } from './pitch';

describe('midiToNoteName', () => {
  it('formats MIDI pitches as note names with octave numbers', () => {
    expect(midiToNoteName(24)).toBe('C1');
    expect(midiToNoteName(60)).toBe('C4');
    expect(midiToNoteName(95)).toBe('B6');
  });
});

describe('pitch-class helpers', () => {
  it('identifies black keys', () => {
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(60)).toBe(false);
  });

  it('identifies C notes', () => {
    expect(isC(24)).toBe(true);
    expect(isC(25)).toBe(false);
  });

  it('handles negative pitches consistently', () => {
    expect(midiToNoteName(-1)).toBe('B-2');
    expect(isBlackKey(-1)).toBe(false);
    expect(isC(-12)).toBe(true);
  });
});
