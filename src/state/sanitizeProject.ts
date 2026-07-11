// Defends the one place a fully external, potentially-malformed Project
// enters the app — an opened .dawproj/.layrproj file or an autosave
// snapshot (see CLAUDE.md's note on sanitizeProject). Every field is
// clamped/defaulted/dropped here rather than trusted, so a corrupted or
// hostile project file degrades to "some data is missing" instead of
// crashing the app or handing Tone.js/React NaN, Infinity, or an unknown
// enum string that would hit an exhaustive switch's `default: throw` in
// engine/effects.ts or engine/instruments/synthFactory.ts. Per-key type
// fallbacks inside those two files already guard individual param values;
// this is the structural layer above them (arrays, discriminated unions,
// enum membership, array-length bounds against a pathological file).
import { generateId } from '../utils/id';
import { clampBpm, clampSwing } from '../engine/time';
import { getDefaultPresetForEngine } from '../engine/instruments/synthPresets';
import {
  DEFAULT_DRUM_LANES,
  TRACK_COLORS,
  type Clip,
  type ClipBase,
  type DrumLaneConfig,
  type DrumPattern,
  type DrumPatternLane,
  type DrumStep,
  type EffectInstance,
  type EffectType,
  type Note,
  type Project,
  type Scene,
  type SynthConfig,
  type SynthEngine,
  type Track,
  type TrackColor,
  type TrackKind,
  type TrackMixer,
  type VolumeKeyframe,
} from './types';

const EFFECT_TYPES = new Set<EffectType>([
  'eq3',
  'compressor',
  'reverb',
  'delay',
  'distortion',
  'filter',
  'chorus',
  'limiter',
]);
const SYNTH_ENGINES = new Set<SynthEngine>(['poly', 'fm', 'mono', 'pluck', 'duo']);
const TRACK_KINDS = new Set<TrackKind>(['drum', 'synth', 'audio']);
const TRACK_COLOR_SET = new Set<string>(TRACK_COLORS);

const MAX_STRING_LENGTH = 200;
const MAX_TICKS = 1_000_000_000; // finite/boundable, far past any realistic arrangement
const MAX_TRACKS = 256;
const MAX_SCENES = 256;
const MAX_CLIPS_PER_TRACK = 2000;
const MAX_EVENTS_PER_CLIP = 10_000; // notes or volume keyframes
const MAX_EFFECTS_PER_CHAIN = 16;
const MAX_LANES = 64;
const SAFE_PARAM_MIN = -100_000;
const SAFE_PARAM_MAX = 100_000;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function str(v: unknown, fallback: string, maxLength = MAX_STRING_LENGTH): string {
  return typeof v === 'string' ? v.slice(0, maxLength) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function finiteNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clampedNumber(v: unknown, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, finiteNumber(v, fallback)));
}

function ticks(v: unknown, fallback = 0): number {
  return Math.round(clampedNumber(v, 0, MAX_TICKS, fallback));
}

function boundedArray(v: unknown, maxLength: number): unknown[] {
  return Array.isArray(v) ? v.slice(0, maxLength) : [];
}

/** Shared by EffectInstance.params and SynthConfig.params (both `Record<string, number|string>`) — keeps finite numbers in a sane magnitude and caps string length, dropping anything else (objects/arrays/NaN/Infinity/booleans). Per-key semantics (real UI ranges) are still enforced by the components layer's own sliders; this only stops a param from being unusable-as-data. */
function sanitizeParams(v: unknown): Record<string, number | string> {
  if (!isObject(v)) return {};
  const out: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(v)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = clampedNumber(value, SAFE_PARAM_MIN, SAFE_PARAM_MAX, 0);
    } else if (typeof value === 'string') {
      out[key] = value.slice(0, 100);
    }
  }
  return out;
}

function sanitizeEffectInstance(v: unknown): EffectInstance | null {
  if (!isObject(v)) return null;
  const type = v['type'];
  if (typeof type !== 'string' || !EFFECT_TYPES.has(type as EffectType)) return null;
  return {
    id: str(v['id'], generateId('fx'), 64),
    type: type as EffectType,
    bypass: bool(v['bypass'], false),
    params: sanitizeParams(v['params']),
  };
}

function sanitizeEffectChain(v: unknown): EffectInstance[] {
  return boundedArray(v, MAX_EFFECTS_PER_CHAIN)
    .map(sanitizeEffectInstance)
    .filter((e): e is EffectInstance => e !== null);
}

function sanitizeInstrument(v: unknown): SynthConfig {
  const fallback = getDefaultPresetForEngine('poly');
  if (!isObject(v)) return { ...fallback, params: { ...fallback.params } };
  const engine = v['engine'];
  if (typeof engine !== 'string' || !SYNTH_ENGINES.has(engine as SynthEngine)) {
    return { ...fallback, params: { ...fallback.params } };
  }
  return {
    engine: engine as SynthEngine,
    presetName: str(v['presetName'], 'Custom', 100),
    params: sanitizeParams(v['params']),
  };
}

function sanitizeDrumLane(v: unknown, fallback: { laneId: string; label: string }): DrumLaneConfig {
  const raw = isObject(v) ? v : {};
  return {
    laneId: fallback.laneId,
    label: str(raw['label'], fallback.label, 64),
    sampleRef: typeof raw['sampleRef'] === 'string' ? raw['sampleRef'].slice(0, MAX_STRING_LENGTH) : undefined,
    gainDb: clampedNumber(raw['gainDb'], -60, 6, 0),
    mute: bool(raw['mute'], false),
  };
}

/** Drum tracks always expose the fixed 8-lane kit (see DEFAULT_DRUM_LANES) — looks each canonical lane up by id in the raw data rather than trusting whatever lane set/order was on disk. */
function sanitizeDrumKit(v: unknown): DrumLaneConfig[] {
  const rawByLaneId = new Map<string, unknown>();
  if (Array.isArray(v)) {
    for (const entry of v) {
      if (isObject(entry) && typeof entry['laneId'] === 'string') rawByLaneId.set(entry['laneId'], entry);
    }
  }
  return DEFAULT_DRUM_LANES.map((lane) => sanitizeDrumLane(rawByLaneId.get(lane.laneId), lane));
}

function sanitizeMixer(v: unknown): TrackMixer {
  const raw = isObject(v) ? v : {};
  return {
    gainDb: clampedNumber(raw['gainDb'], -60, 6, 0),
    pan: clampedNumber(raw['pan'], -1, 1, 0),
    mute: bool(raw['mute'], false),
    solo: bool(raw['solo'], false),
  };
}

function sanitizeDrumStep(v: unknown): DrumStep {
  const raw = isObject(v) ? v : {};
  return { on: bool(raw['on'], false), velocity: clampedNumber(raw['velocity'], 0, 1, 0.85) };
}

function sanitizeDrumPatternLane(v: unknown, stepCount: number): DrumPatternLane {
  const raw = isObject(v) ? v : {};
  const rawSteps = boundedArray(raw['steps'], stepCount);
  const steps: DrumStep[] = [];
  for (let i = 0; i < stepCount; i++) steps.push(sanitizeDrumStep(rawSteps[i]));
  return { laneId: str(raw['laneId'], generateId('lane'), 64), steps };
}

function sanitizeDrumPattern(v: unknown): DrumPattern {
  const raw = isObject(v) ? v : {};
  const steps: 16 | 32 = raw['steps'] === 32 ? 32 : 16;
  const swing = clampSwing(finiteNumber(raw['swing'], 0));
  const lanes = boundedArray(raw['lanes'], MAX_LANES).map((l) => sanitizeDrumPatternLane(l, steps));
  return { steps, swing, lanes };
}

function sanitizeNote(v: unknown): Note | null {
  if (!isObject(v)) return null;
  const pitch = finiteNumber(v['pitch'], NaN);
  if (!Number.isFinite(pitch)) return null;
  return {
    pitch: Math.max(0, Math.min(127, Math.round(pitch))),
    startTicks: ticks(v['startTicks']),
    durationTicks: Math.max(1, ticks(v['durationTicks'], 240)),
    velocity: clampedNumber(v['velocity'], 0, 1, 0.8),
  };
}

function sanitizeVolumeKeyframes(v: unknown): VolumeKeyframe[] | undefined {
  if (!Array.isArray(v) || v.length === 0) return undefined;
  const kfs = boundedArray(v, MAX_EVENTS_PER_CLIP)
    .filter(isObject)
    .map((kf) => ({ ticks: ticks(kf['ticks']), value: clampedNumber(kf['value'], 0, 1, 1) }));
  return kfs.length > 0 ? kfs : undefined;
}

function sanitizeClipBase(v: Record<string, unknown>): ClipBase {
  const base: ClipBase = {
    id: str(v['id'], generateId('clip'), 64),
    startTicks: ticks(v['startTicks']),
    lengthTicks: Math.max(1, ticks(v['lengthTicks'], 240)),
  };
  if (typeof v['name'] === 'string') base.name = v['name'].slice(0, MAX_STRING_LENGTH);
  const keyframes = sanitizeVolumeKeyframes(v['volumeKeyframes']);
  if (keyframes) base.volumeKeyframes = keyframes;
  if (v['volumeCurve'] === 'spline' || v['volumeCurve'] === 'linear') base.volumeCurve = v['volumeCurve'];
  if (typeof v['sceneId'] === 'string') base.sceneId = v['sceneId'];
  return base;
}

function sanitizeClip(v: unknown): Clip | null {
  if (!isObject(v)) return null;
  const base = sanitizeClipBase(v);
  const kind = v['kind'];
  if (kind === 'pattern') {
    return { ...base, kind: 'pattern', pattern: sanitizeDrumPattern(v['pattern']) };
  }
  if (kind === 'midi') {
    const notes = boundedArray(v['notes'], MAX_EVENTS_PER_CLIP)
      .map(sanitizeNote)
      .filter((n): n is Note => n !== null);
    return { ...base, kind: 'midi', notes };
  }
  if (kind === 'audio') {
    const fileRef = v['fileRef'];
    // No ref means nothing to play — dropping avoids a permanently-broken
    // silent clip that still occupies arrangement space.
    if (typeof fileRef !== 'string' || fileRef.length === 0) return null;
    return {
      ...base,
      kind: 'audio',
      fileRef: fileRef.slice(0, MAX_STRING_LENGTH),
      bufferOffsetSec: Math.max(0, finiteNumber(v['bufferOffsetSec'], 0)),
      gainDb: clampedNumber(v['gainDb'], -60, 24, 0),
    };
  }
  return null;
}

function nextFreeColor(used: Set<string>): TrackColor {
  const free = TRACK_COLORS.find((c) => !used.has(c));
  return free ?? TRACK_COLORS[used.size % TRACK_COLORS.length]!;
}

function sanitizeTrack(v: unknown, usedColors: Set<string>): Track | null {
  if (!isObject(v)) return null;
  const kind = v['kind'];
  if (typeof kind !== 'string' || !TRACK_KINDS.has(kind as TrackKind)) return null;

  const rawColor = v['color'];
  const color = typeof rawColor === 'string' && TRACK_COLOR_SET.has(rawColor) ? (rawColor as TrackColor) : nextFreeColor(usedColors);
  usedColors.add(color);

  const track: Track = {
    id: str(v['id'], generateId('trk'), 64),
    name: str(v['name'], 'Track', MAX_STRING_LENGTH),
    color,
    kind: kind as TrackKind,
    mixer: sanitizeMixer(v['mixer']),
    effects: sanitizeEffectChain(v['effects']),
    clips: boundedArray(v['clips'], MAX_CLIPS_PER_TRACK)
      .map(sanitizeClip)
      .filter((c): c is Clip => c !== null),
  };
  if (kind === 'synth') track.instrument = sanitizeInstrument(v['instrument']);
  if (kind === 'drum') track.drumKit = sanitizeDrumKit(v['drumKit']);
  if (kind === 'audio') track.armed = bool(v['armed'], false);
  return track;
}

function sanitizeScene(v: unknown): Scene | null {
  if (!isObject(v)) return null;
  return { id: str(v['id'], generateId('scene'), 64), name: str(v['name'], 'Scene', MAX_STRING_LENGTH) };
}

/**
 * Rebuilds `project` field-by-field, clamping/defaulting/dropping anything
 * malformed instead of trusting the input's shape — the one place a fully
 * external Project (an opened project file, a .layrproj bundle, an
 * autosave snapshot) enters the app. Never throws: garbage input in any
 * single field degrades that field to a safe default rather than failing
 * the whole load.
 */
export function sanitizeProject(project: unknown): Project {
  const raw = isObject(project) ? project : {};

  const usedColors = new Set<string>();
  const tracks = boundedArray(raw['tracks'], MAX_TRACKS)
    .map((t) => sanitizeTrack(t, usedColors))
    .filter((t): t is Track => t !== null);

  const scenes = boundedArray(raw['scenes'], MAX_SCENES)
    .map(sanitizeScene)
    .filter((s): s is Scene => s !== null);

  // A clip's sceneId can point at a scene that got dropped above (bad id,
  // duplicate, over the cap) — clear the dangling reference so Session view
  // never renders a clip against a row that doesn't exist.
  const sceneIds = new Set(scenes.map((s) => s.id));
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.sceneId && !sceneIds.has(clip.sceneId)) clip.sceneId = undefined;
    }
  }

  return {
    version: 1,
    name: str(raw['name'], 'Untitled Song', MAX_STRING_LENGTH),
    bpm: clampBpm(typeof raw['bpm'] === 'number' ? raw['bpm'] : NaN),
    masterGainDb: clampedNumber(raw['masterGainDb'], -60, 6, 0),
    masterEffects: sanitizeEffectChain(raw['masterEffects']),
    tracks,
    scenes,
  };
}
