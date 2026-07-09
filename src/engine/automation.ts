// Pure volume-automation math for clips' "volume keyframes" — no Tone.js, no
// React, same split as time.ts: keep the curve math testable and let
// graph.ts do the Tone-side scheduling that consumes it.
import type { VolumeKeyframe } from '../state/types';

export type VolumeCurve = 'linear' | 'spline';

export function sortKeyframes(keyframes: VolumeKeyframe[]): VolumeKeyframe[] {
  return [...keyframes].sort((a, b) => a.ticks - b.ticks);
}

// Uniform Catmull-Rom through p1..p2, using p0/p3 as the neighboring
// keyframes for tangent estimation — passes exactly through every keyframe
// (unlike a bezier, which would need explicit handles), which is what
// makes "just pick spline instead of linear" work with zero extra UI.
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Synthesizes a "flat" neighbor at each end (same value as the nearest real
// keyframe) rather than linearly extrapolating one — a clamped end
// condition, so the curve doesn't overshoot wildly right at a clip's first/
// last point the way a naive extrapolated Catmull-Rom can.
function sampleSpline(sorted: VolumeKeyframe[], ticks: number): number {
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i]!;
    const p2 = sorted[i + 1]!;
    if (ticks < p1.ticks || ticks > p2.ticks) continue;
    const p0 = sorted[i - 1] ?? { ticks: p1.ticks, value: p1.value };
    const p3 = sorted[i + 2] ?? { ticks: p2.ticks, value: p2.value };
    const span = p2.ticks - p1.ticks;
    const t = span === 0 ? 0 : (ticks - p1.ticks) / span;
    return catmullRom(p0.value, p1.value, p2.value, p3.value, t);
  }
  return sorted[sorted.length - 1]!.value;
}

/**
 * Interpolated gain multiplier (0..1) at a clip-relative tick position,
 * either 'linear' (straight segments between keyframes) or 'spline' (a
 * Catmull-Rom curve through every keyframe, clamped to 0..1 since spline
 * curves can overshoot their control points). Holds the nearest edge
 * keyframe's value outside the keyframe range; returns 1 (no attenuation)
 * when there are no keyframes at all.
 */
export function sampleVolumeAtTick(
  keyframes: VolumeKeyframe[] | undefined,
  ticks: number,
  curve: VolumeCurve = 'linear',
): number {
  if (!keyframes || keyframes.length === 0) return 1;
  const sorted = sortKeyframes(keyframes);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (ticks <= first.ticks) return first.value;
  if (ticks >= last.ticks) return last.value;

  if (curve === 'spline') {
    return Math.max(0, Math.min(1, sampleSpline(sorted, ticks)));
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
