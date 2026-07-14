// Shared clamp/default for the three stacking playback-speed multipliers:
// ClipBase.speed ("bar" level), Track.speed, and Scene.speed (Session view).
// Effective speed for a given clip is always the product of whichever of
// these apply (see graph.ts for Timeline playback — clip*track only — and
// sessionPlayer.ts for Session playback — clip*track*scene). Each level
// defaults to 1.0 (no change) so an untouched clip/track/scene never
// affects the others.
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;
export const DEFAULT_SPEED = 1;

export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return DEFAULT_SPEED;
  return Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed));
}

// The effective playback multiplier for a clip is the product of whichever
// speed levels apply — clip*track on the Timeline (graph.ts), clip*track*scene
// in Session view (sessionPlayer.ts). Each level is clamped individually
// (undefined -> 1.0, so an untouched level is a no-op), and the final product
// is clamped again so two maxed levels can't drive Tone.Player.playbackRate or
// a loop length to a pathological value — playback stays inside MIN..MAX
// regardless of how the levels stack.
export function effectiveSpeed(...levels: Array<number | undefined>): number {
  let product = DEFAULT_SPEED;
  for (const level of levels) product *= clampSpeed(level ?? DEFAULT_SPEED);
  return clampSpeed(product);
}
