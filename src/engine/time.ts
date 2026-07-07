// Pure tick math. No Tone.js, no React. Everything the rest of the engine
// and UI needs to convert between our integer-tick data model and musical
// display or Tone.js time notation lives here, tested in time.test.ts.
//
// All musical time in the project is integer ticks at 960 PPQ (a sixteenth
// note = 240 ticks), 4/4 only in v1. The Transport's own PPQ is set to match
// (see engine/transport.ts), so a tick value can be handed to Tone as the
// string `${ticks}i` and stay glitch-free across BPM changes — Tone resolves
// "i" (ticks) time relative to its own tempo-linked clock, not a
// precomputed wall-clock offset.

import { PPQ } from '../state/types';

export { PPQ };
export const BEATS_PER_BAR = 4; // 4/4 only in v1
export const TICKS_PER_BEAT = PPQ;
export const TICKS_PER_SIXTEENTH = PPQ / 4; // 240
export const TICKS_PER_BAR = TICKS_PER_BEAT * BEATS_PER_BAR; // 3840
export const SIXTEENTHS_PER_BAR = TICKS_PER_BAR / TICKS_PER_SIXTEENTH; // 16

export function ticksToSeconds(ticks: number, bpm: number): number {
  const secondsPerBeat = 60 / bpm;
  return (ticks / TICKS_PER_BEAT) * secondsPerBeat;
}

export function secondsToTicks(seconds: number, bpm: number): number {
  const secondsPerBeat = 60 / bpm;
  return (seconds / secondsPerBeat) * TICKS_PER_BEAT;
}

export function barsToTicks(bars: number): number {
  return bars * TICKS_PER_BAR;
}

export function ticksToBars(ticks: number): number {
  return ticks / TICKS_PER_BAR;
}

/** Formats a tick value as Tone.js "ticks" time notation, e.g. `"1920i"`. */
export function ticksToToneTime(ticks: number): string {
  return `${Math.round(ticks)}i`;
}

export interface BarsBeatsSixteenths {
  bar: number; // 1-indexed
  beat: number; // 1-indexed, 1..BEATS_PER_BAR
  sixteenth: number; // 1-indexed, 1..4
}

/** Converts an absolute tick position into 1-indexed bars:beats:sixteenths for display. */
export function ticksToBarsBeatsSixteenths(ticks: number): BarsBeatsSixteenths {
  const t = Math.max(0, Math.round(ticks));
  const bar = Math.floor(t / TICKS_PER_BAR) + 1;
  const remainderInBar = t % TICKS_PER_BAR;
  const beat = Math.floor(remainderInBar / TICKS_PER_BEAT) + 1;
  const remainderInBeat = remainderInBar % TICKS_PER_BEAT;
  const sixteenth = Math.floor(remainderInBeat / TICKS_PER_SIXTEENTH) + 1;
  return { bar, beat, sixteenth };
}

function padLeft(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function formatBarsBeatsSixteenths(bbs: BarsBeatsSixteenths): string {
  return `${padLeft(bbs.bar, 3)}:${bbs.beat}:${padLeft(bbs.sixteenth, 2)}`;
}

export function formatTicksAsPosition(ticks: number): string {
  return formatBarsBeatsSixteenths(ticksToBarsBeatsSixteenths(ticks));
}

/** Length in ticks of a pattern with the given step count (all sixteenth-note steps). */
export function patternLengthTicks(steps: number): number {
  return steps * TICKS_PER_SIXTEENTH;
}

/**
 * Tick offset of a step within its pattern, including swing. Swing delays
 * every 2nd sixteenth (odd step indices, 0-indexed) by `swing` (0..0.66) of
 * a sixteenth-note duration.
 */
export function stepOffsetTicks(stepIndex: number, swing: number): number {
  const base = stepIndex * TICKS_PER_SIXTEENTH;
  const isSwungStep = stepIndex % 2 === 1;
  return isSwungStep ? base + swing * TICKS_PER_SIXTEENTH : base;
}

export function clampSwing(swing: number): number {
  return Math.max(0, Math.min(0.66, swing));
}

export function clampBpm(bpm: number): number {
  return Math.max(40, Math.min(240, bpm));
}

/** Snaps a tick value down to the nearest multiple of `resolutionTicks`. */
export function snapTicksDown(ticks: number, resolutionTicks: number): number {
  return Math.floor(ticks / resolutionTicks) * resolutionTicks;
}

/** Snaps a tick value to the nearest multiple of `resolutionTicks`. */
export function snapTicksNearest(ticks: number, resolutionTicks: number): number {
  return Math.round(ticks / resolutionTicks) * resolutionTicks;
}
