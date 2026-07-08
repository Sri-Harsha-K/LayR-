// Pure volume-automation math for clips' "volume keyframes" — no Tone.js, no
// React, same split as time.ts: keep the curve math testable and let
// graph.ts do the Tone-side scheduling that consumes it.
import type { VolumeKeyframe } from '../state/types';

export function sortKeyframes(keyframes: VolumeKeyframe[]): VolumeKeyframe[] {
  return [...keyframes].sort((a, b) => a.ticks - b.ticks);
}

/**
 * Linear-interpolated gain multiplier (0..1) at a clip-relative tick
 * position. Holds the nearest edge keyframe's value outside the keyframe
 * range; returns 1 (no attenuation) when there are no keyframes at all.
 */
export function sampleVolumeAtTick(keyframes: VolumeKeyframe[] | undefined, ticks: number): number {
  if (!keyframes || keyframes.length === 0) return 1;
  const sorted = sortKeyframes(keyframes);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (ticks <= first.ticks) return first.value;
  if (ticks >= last.ticks) return last.value;
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
