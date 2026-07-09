import { TICKS_PER_BAR, TICKS_PER_BEAT, TICKS_PER_SIXTEENTH, snapTicksDown, snapTicksNearest } from '../../engine/time';

export const PITCH_MIN = 24; // C1
export const PITCH_MAX = 95; // B6
export const ROW_HEIGHT = 14;
export const KEYBOARD_WIDTH = 44;

export interface SnapOption {
  label: string;
  ticks: number;
}

export const SNAP_OPTIONS: SnapOption[] = [
  { label: '1/1', ticks: TICKS_PER_BAR },
  { label: '1/2', ticks: TICKS_PER_BAR / 2 },
  { label: '1/4', ticks: TICKS_PER_BEAT },
  { label: '1/8', ticks: TICKS_PER_BEAT / 2 },
  { label: '1/16', ticks: TICKS_PER_SIXTEENTH },
  { label: '1/32', ticks: TICKS_PER_SIXTEENTH / 2 },
];

export function pitchToY(pitch: number): number {
  return (PITCH_MAX - pitch) * ROW_HEIGHT;
}

export function yToPitch(y: number): number {
  return Math.max(PITCH_MIN, Math.min(PITCH_MAX, PITCH_MAX - Math.floor(y / ROW_HEIGHT)));
}

export function tickToX(ticks: number, pxPerTick: number): number {
  return ticks * pxPerTick;
}

export function xToTick(x: number, pxPerTick: number): number {
  return Math.max(0, x / pxPerTick);
}

export const snapDown = snapTicksDown;
export const snapNearest = snapTicksNearest;

/** All playable pitches, highest first — matches the piano roll's top-to-bottom row order. */
export const PITCHES: number[] = Array.from({ length: PITCH_MAX - PITCH_MIN + 1 }, (_, i) => PITCH_MAX - i);
export const GRID_HEIGHT = PITCHES.length * ROW_HEIGHT;
