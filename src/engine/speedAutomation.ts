// Turns a clip's speed (scalar OR a speed-keyframe curve) into a "time warp":
// a function mapping a content tick (where an event sits in the clip's own
// timeline) to the output tick at which it should actually fire. That warp is
// the cumulative integral of 1/speed over the bar — faster speed means less
// output time accrues, so events bunch closer together and the loop period
// shrinks.
//
// The constant case is exact and free: with no keyframes, speed is a single
// value s and warp(t) = t / s — byte-for-byte the `offset / speed` divide the
// engine used before speed automation existed. So adding curves changes
// nothing for clips that don't use them.
//
// Pure (no Tone/React), same split as time.ts/automation.ts, so the warp math
// is unit-tested on its own.
import { sampleCurveAtTick, type VolumeCurve } from './automation';
import { clampSpeed, MAX_SPEED, MIN_SPEED } from './speed';
import type { VolumeKeyframe } from '../state/types';

// Integration resolution. A 1-bar clip is 3840 ticks -> 64 samples, plenty
// fine for an audibly-smooth warp while staying cheap to build per clip.
const WARP_STEP_TICKS = 60;

export interface SpeedWarpOptions {
  /** Per-bar speed curve. When present (non-empty), it defines the clip's speed and clipScalarSpeed is ignored. */
  speedKeyframes?: VolumeKeyframe[];
  speedCurve?: VolumeCurve;
  /** Single clip-level speed multiplier, used only when there's no curve. */
  clipScalarSpeed?: number;
  /** Track (and, in Session, scene) multiplier — already the product, applied on top of the clip level. */
  outerSpeed: number;
  /** Content-tick span the warp is defined over: the pattern loop length for pattern clips, the clip length for MIDI. */
  domainTicks: number;
}

/** Returns warp(contentTick) -> output tick. See file header for the model. */
export function buildSpeedWarp(opts: SpeedWarpOptions): (contentTick: number) => number {
  const { speedKeyframes, speedCurve = 'linear', clipScalarSpeed, outerSpeed, domainTicks } = opts;
  const hasCurve = !!speedKeyframes && speedKeyframes.length > 0;

  // Instantaneous effective speed at content tick u, clamped the same way the
  // scalar path clamps its product so a curve can't exceed the engine bounds.
  const speedAt = (u: number): number => {
    const clipSpeed = hasCurve
      ? sampleCurveAtTick(speedKeyframes, u, speedCurve, MIN_SPEED, MAX_SPEED)
      : clampSpeed(clipScalarSpeed ?? 1);
    return clampSpeed(clipSpeed * outerSpeed);
  };

  if (!hasCurve) {
    const s = speedAt(0); // constant across the bar
    return (t) => t / s;
  }

  const domain = Math.max(1, domainTicks);
  const steps = Math.max(1, Math.ceil(domain / WARP_STEP_TICKS));
  const dt = domain / steps;
  // cum[i] = output ticks elapsed by content tick i*dt (midpoint rule).
  const cum: number[] = new Array(steps + 1);
  cum[0] = 0;
  for (let i = 0; i < steps; i++) {
    cum[i + 1] = cum[i]! + dt / speedAt((i + 0.5) * dt);
  }

  return (t: number): number => {
    if (t <= 0) return 0;
    // Past the integrated domain (e.g. a MIDI note tail extending beyond it),
    // continue at the boundary's rate rather than clamping the time flat.
    if (t >= domain) return cum[steps]! + (t - domain) / speedAt(domain);
    const pos = t / dt;
    const i = Math.floor(pos);
    return cum[i]! + (cum[i + 1]! - cum[i]!) * (pos - i);
  };
}

// Inverse of a warp over [0, domainTicks]: given an OUTPUT-tick offset, find the
// content tick that maps to it (the warp is monotonic, so bisection converges).
// The playback highlighters use this — the transport playhead is in output
// ticks, but the sequencer's playing column / piano-roll playhead need the
// content position, so the highlight tracks the sped-up (or curve-warped)
// audio instead of sweeping at the un-warped rate.
export function invertWarp(forward: (t: number) => number, outputTick: number, domainTicks: number): number {
  const domain = Math.max(1, domainTicks);
  if (outputTick <= 0) return 0;
  if (outputTick >= forward(domain)) return domain;
  let lo = 0;
  let hi = domain;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    if (forward(mid) < outputTick) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
