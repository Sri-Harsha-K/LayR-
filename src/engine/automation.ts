// Pure volume-automation math for clips' "volume keyframes" — no Tone.js, no
// React, same split as time.ts: keep the curve math testable and let
// graph.ts do the Tone-side scheduling that consumes it.
import type { KeyframeHandle, VolumeKeyframe } from '../state/types';

export type VolumeCurve = 'linear' | 'spline';

export function sortKeyframes(keyframes: VolumeKeyframe[]): VolumeKeyframe[] {
  return [...keyframes].sort((a, b) => a.ticks - b.ticks);
}

function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const m = 1 - t;
  return m * m * m * p0 + 3 * m * m * t * p1 + 3 * m * t * t * p2 + t * t * t * p3;
}

// Bezier x(t) is monotonic within a segment (we clamp handle tick-extent to the
// segment below), so a plain bisection finds the t whose x equals the target
// tick. 24 iterations resolves a 3840-tick bar to sub-tick precision.
function solveTForX(x0: number, x1: number, x2: number, x3: number, targetX: number): number {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    if (cubic(x0, x1, x2, x3, mid) < targetX) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// The default tangent direction at a keyframe when it carries no explicit
// handle: the slope through its two neighbors (one-sided at the ends). This is
// what makes an untouched 'spline' smooth (Catmull-Rom-like) with zero handle
// data, so old projects and freshly-added points curve sensibly until dragged.
function defaultSlope(sorted: VolumeKeyframe[], i: number): number {
  const p = sorted[i]!;
  const prev = sorted[i - 1] ?? p;
  const next = sorted[i + 1] ?? p;
  const dx = next.ticks - prev.ticks;
  return dx === 0 ? 0 : (next.value - prev.value) / dx;
}

const ZERO_HANDLE: KeyframeHandle = { dticks: 0, dvalue: 0 };

/**
 * The in/out tangent handles actually used for keyframe `i` — the explicit ones
 * if the user has dragged them, otherwise a default derived from the neighbor
 * slope (length = 1/3 of the adjacent segment, the usual bezier default). Both
 * the sampler below and the editor call this, so the drawn handles and the
 * played curve are guaranteed to match. Offsets are relative to the keyframe.
 */
export function effectiveHandles(sorted: VolumeKeyframe[], i: number): { inH: KeyframeHandle; outH: KeyframeHandle } {
  const p = sorted[i]!;
  const prev = sorted[i - 1];
  const next = sorted[i + 1];
  const slope = defaultSlope(sorted, i);
  let outH = p.hOut;
  if (!outH && next) {
    const dt = (next.ticks - p.ticks) / 3;
    outH = { dticks: dt, dvalue: slope * dt };
  }
  let inH = p.hIn;
  if (!inH && prev) {
    const dt = (prev.ticks - p.ticks) / 3; // negative — points back
    inH = { dticks: dt, dvalue: slope * dt };
  }
  return { inH: inH ?? ZERO_HANDLE, outH: outH ?? ZERO_HANDLE };
}

// Cubic-bezier value at a tick: find the segment, build its control points from
// the two keyframes' out/in handles (tick-extent clamped into the segment so
// x stays monotonic and solvable), solve x(t)=tick, evaluate y(t).
function sampleBezier(sorted: VolumeKeyframe[], ticks: number): number {
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (ticks < a.ticks || ticks > b.ticks) continue;
    const outH = effectiveHandles(sorted, i).outH;
    const inH = effectiveHandles(sorted, i + 1).inH;
    const p1x = Math.max(a.ticks, Math.min(b.ticks, a.ticks + outH.dticks));
    const p2x = Math.max(a.ticks, Math.min(b.ticks, b.ticks + inH.dticks));
    const p1y = a.value + outH.dvalue;
    const p2y = b.value + inH.dvalue;
    const t = solveTForX(a.ticks, p1x, p2x, b.ticks, ticks);
    return cubic(a.value, p1y, p2y, b.value, t);
  }
  return sorted[sorted.length - 1]!.value;
}

/**
 * Interpolated keyframe value at a clip-relative tick position, either
 * 'linear' (straight segments) or 'spline' (a cubic bezier through every
 * keyframe, shaped by each point's in/out tangent handles and clamped to
 * [clampMin, clampMax] since a bezier can overshoot its control points). Holds
 * the nearest edge keyframe's value outside the keyframe range; returns 1
 * (clamped) when there are no keyframes at all.
 *
 * Generalized over the clamp range so the SAME curve math serves two channels:
 * volume (0..1 gain, via sampleVolumeAtTick) and speed (MIN_SPEED..MAX_SPEED,
 * via engine/speedAutomation.ts). Only the bounds differ — never the shape.
 */
export function sampleCurveAtTick(
  keyframes: VolumeKeyframe[] | undefined,
  ticks: number,
  curve: VolumeCurve = 'linear',
  clampMin = 0,
  clampMax = 1,
): number {
  const clamp = (v: number) => Math.max(clampMin, Math.min(clampMax, v));
  if (!keyframes || keyframes.length === 0) return clamp(1);
  const sorted = sortKeyframes(keyframes);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (ticks <= first.ticks) return first.value;
  if (ticks >= last.ticks) return last.value;

  if (curve === 'spline') {
    return clamp(sampleBezier(sorted, ticks));
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (ticks >= a.ticks && ticks <= b.ticks) {
      const t = (ticks - a.ticks) / (b.ticks - a.ticks);
      return a.value + (b.value - a.value) * t;
    }
  }
  return last.value;
}

/**
 * Interpolated gain multiplier (0..1) at a clip-relative tick — the volume
 * channel of sampleCurveAtTick. Returns 1 (no attenuation) with no keyframes.
 */
export function sampleVolumeAtTick(
  keyframes: VolumeKeyframe[] | undefined,
  ticks: number,
  curve: VolumeCurve = 'linear',
): number {
  return sampleCurveAtTick(keyframes, ticks, curve, 0, 1);
}
