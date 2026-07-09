// Canonical project data model. All musical time is integer ticks at 960 PPQ
// (sixteenth note = 240 ticks). This file has zero React imports — it is safe
// to import from both /engine and /components.

export const PPQ = 960;

export const TRACK_COLORS = [
  '#e0654f', // vermilion
  '#d9a441', // amber
  '#7fa876', // sage
  '#4f9bd9', // azure
  '#a879c9', // violet
  '#5fb8a8', // teal
  '#c96f9e', // rose
  '#8f8f6f', // olive
] as const;

export type TrackColor = (typeof TRACK_COLORS)[number];

export interface Project {
  version: 1;
  name: string;
  bpm: number; // 40-240; single tempo, 4/4 only in v1
  masterGainDb: number;
  masterEffects: EffectInstance[];
  tracks: Track[];
  /** Session-view rows. A clip joins a scene via ClipBase.sceneId. */
  scenes: Scene[];
}

export interface Scene {
  id: string;
  name: string;
}

export type TrackKind = 'drum' | 'synth' | 'audio';

export interface TrackMixer {
  gainDb: number;
  pan: number; // -1..1
  mute: boolean;
  solo: boolean;
}

export interface DrumLaneConfig {
  laneId: string;
  label: string;
  sampleRef?: string; // path/ref into project /audio folder; absent = synthesized voice
  gainDb: number;
  mute: boolean;
}

export interface Track {
  id: string;
  name: string;
  color: TrackColor;
  kind: TrackKind;
  mixer: TrackMixer;
  effects: EffectInstance[];
  instrument?: SynthConfig; // synth tracks
  drumKit?: DrumLaneConfig[]; // drum tracks
  armed?: boolean; // audio tracks
  clips: Clip[];
}

export interface VolumeKeyframe {
  ticks: number; // clip-relative, 0..lengthTicks
  value: number; // 0..1 linear gain multiplier
}

export interface ClipBase {
  id: string;
  startTicks: number;
  lengthTicks: number;
  /** User-facing label, editable from the Sound tab. Undefined falls back to a kind-based label (see clipLabel in ArrangementView). */
  name?: string;
  volumeKeyframes?: VolumeKeyframe[];
  /** How volumeKeyframes interpolate between points. Undefined = 'linear' (see engine/automation.ts). */
  volumeCurve?: 'linear' | 'spline';
  /** Session-view row this clip belongs to. Undefined = Timeline-only, not shown in the Session grid. */
  sceneId?: string;
}

export type Clip = ClipBase &
  (
    | { kind: 'pattern'; pattern: DrumPattern }
    | { kind: 'midi'; notes: Note[] }
    | { kind: 'audio'; fileRef: string; bufferOffsetSec: number; gainDb: number }
  );

export interface DrumStep {
  on: boolean;
  velocity: number; // 0..1
}

export interface DrumPatternLane {
  laneId: string;
  steps: DrumStep[];
}

export interface DrumPattern {
  steps: 16 | 32;
  swing: number; // 0..0.66, delays every 2nd sixteenth
  lanes: DrumPatternLane[];
}

export interface Note {
  pitch: number; // MIDI int
  startTicks: number;
  durationTicks: number;
  velocity: number; // 0..1
}

export type SynthEngine = 'poly' | 'fm' | 'mono' | 'pluck' | 'duo';

export interface SynthConfig {
  engine: SynthEngine;
  presetName: string;
  params: Record<string, number | string>;
}

export type EffectType =
  | 'eq3'
  | 'compressor'
  | 'reverb'
  | 'delay'
  | 'distortion'
  | 'filter'
  | 'chorus'
  | 'limiter';

export interface EffectInstance {
  id: string;
  type: EffectType;
  bypass: boolean;
  params: Record<string, number | string>;
}

export const DEFAULT_DRUM_LANES: readonly { laneId: string; label: string }[] = [
  { laneId: 'kick', label: 'Kick' },
  { laneId: 'snare', label: 'Snare' },
  { laneId: 'clap', label: 'Clap' },
  { laneId: 'closedHat', label: 'Cl. Hat' },
  { laneId: 'openHat', label: 'Op. Hat' },
  { laneId: 'lowTom', label: 'Lo Tom' },
  { laneId: 'midTom', label: 'Mid Tom' },
  { laneId: 'rim', label: 'Rim' },
] as const;
