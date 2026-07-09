import { create, useStore } from 'zustand';
import { temporal } from 'zundo';
import type { TemporalState } from 'zundo';
import { generateId } from '../utils/id';
import { patternLengthTicks, ticksToSeconds } from '../engine/time';
import { getDefaultPresetForEngine } from '../engine/instruments/synthPresets';
import {
  DEFAULT_DRUM_LANES,
  TRACK_COLORS,
  type Clip,
  type DrumLaneConfig,
  type DrumPattern,
  type EffectInstance,
  type Project,
  type Scene,
  type SynthConfig,
  type Track,
  type TrackColor,
} from './types';

export function createEmptyProject(name = 'Untitled Song'): Project {
  return {
    version: 1,
    name,
    bpm: 120,
    masterGainDb: 0,
    masterEffects: [
      { id: generateId('fx'), type: 'limiter', bypass: false, params: { threshold: -1 } },
    ],
    tracks: [],
    scenes: [],
  };
}

/** The tick position where the last clip on any track ends — the natural length of the whole arrangement. 0 if there are no clips. */
export function furthestClipEndTicks(tracks: Track[]): number {
  let furthest = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      furthest = Math.max(furthest, clip.startTicks + clip.lengthTicks);
    }
  }
  return furthest;
}

function nextTrackColor(existing: Track[]): TrackColor {
  const used = new Set(existing.map((t) => t.color));
  const free = TRACK_COLORS.find((c) => !used.has(c));
  return free ?? TRACK_COLORS[existing.length % TRACK_COLORS.length]!;
}

/** Auto-names a new clip "<Label> N", counting only same-kind clips already on the track — matches the mock's named clips (Verse Beat, Bassline, ...) without requiring the user to name every one up front. */
export function nextClipName(track: Track, kind: Clip['kind'], label: string): string {
  const count = track.clips.filter((c) => c.kind === kind).length;
  return `${label} ${count + 1}`;
}

function defaultDrumKit(): DrumLaneConfig[] {
  return DEFAULT_DRUM_LANES.map((l) => ({
    laneId: l.laneId,
    label: l.label,
    gainDb: 0,
    mute: false,
  }));
}

export function createDefaultPattern(steps: 16 | 32 = 16): DrumPattern {
  return {
    steps,
    swing: 0,
    lanes: DEFAULT_DRUM_LANES.map((l) => ({
      laneId: l.laneId,
      steps: Array.from({ length: steps }, () => ({ on: false, velocity: 0.85 })),
    })),
  };
}

export function defaultSynthConfig(): SynthConfig {
  return { ...getDefaultPresetForEngine('poly'), params: { ...getDefaultPresetForEngine('poly').params } };
}

interface ProjectActions {
  loadProject: (project: Project) => void;
  setBpm: (bpm: number) => void;
  setMasterGainDb: (db: number) => void;
  addTrack: (kind: Track['kind'], name?: string) => string;
  removeTrack: (trackId: string) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;
  renameTrack: (trackId: string, name: string) => void;
  updateTrackMixer: (trackId: string, patch: Partial<Track['mixer']>) => void;
  addTrackEffect: (trackId: string, effect: EffectInstance) => void;
  removeTrackEffect: (trackId: string, effectId: string) => void;
  reorderTrackEffects: (trackId: string, fromIndex: number, toIndex: number) => void;
  updateTrackEffect: (trackId: string, effectId: string, patch: Partial<EffectInstance>) => void;
  addMasterEffect: (effect: EffectInstance) => void;
  removeMasterEffect: (effectId: string) => void;
  reorderMasterEffects: (fromIndex: number, toIndex: number) => void;
  updateMasterEffect: (effectId: string, patch: Partial<EffectInstance>) => void;
  addClip: (trackId: string, clip: Clip) => void;
  addDefaultPatternClip: (trackId: string) => string;
  addDefaultMidiClip: (trackId: string) => string;
  updateClip: (trackId: string, clipId: string, patch: Partial<Clip>) => void;
  moveClipToTrack: (fromTrackId: string, toTrackId: string, clipId: string, patch: Partial<Clip>) => void;
  splitClip: (trackId: string, clipId: string, atTicks: number) => void;
  removeClip: (trackId: string, clipId: string) => void;
  duplicateClip: (trackId: string, clipId: string) => string | undefined;
  setTrackInstrument: (trackId: string, instrument: SynthConfig) => void;
  setTrackDrumKit: (trackId: string, drumKit: DrumLaneConfig[]) => void;
  setTrackArmed: (trackId: string, armed: boolean) => void;
  addScene: (name?: string) => string;
  renameScene: (sceneId: string, name: string) => void;
  removeScene: (sceneId: string) => void;
  reorderScenes: (fromIndex: number, toIndex: number) => void;
  setClipScene: (trackId: string, clipId: string, sceneId: string | undefined) => void;
}

export type ProjectStore = { project: Project } & ProjectActions;

function withTrack(project: Project, trackId: string, fn: (t: Track) => Track): Project {
  return {
    ...project,
    tracks: project.tracks.map((t) => (t.id === trackId ? fn(t) : t)),
  };
}

export const useProjectStore = create<ProjectStore>()(
  temporal(
    (set, get) => ({
      project: createEmptyProject(),

      // Projects saved before Phase 7 have no `scenes` key on disk despite
      // the `Project` type claiming it's always present — default it at the
      // load boundary rather than trusting the type here.
      loadProject: (project) => set({ project: { ...project, scenes: project.scenes ?? [] } }),

      setBpm: (bpm) =>
        set((s) => ({ project: { ...s.project, bpm: Math.max(40, Math.min(240, bpm)) } })),

      setMasterGainDb: (db) => set((s) => ({ project: { ...s.project, masterGainDb: db } })),

      addTrack: (kind, name) => {
        const id = generateId('trk');
        set((s) => {
          const track: Track = {
            id,
            name: name ?? `${kind[0]!.toUpperCase()}${kind.slice(1)} ${s.project.tracks.length + 1}`,
            color: nextTrackColor(s.project.tracks),
            kind,
            mixer: { gainDb: 0, pan: 0, mute: false, solo: false },
            effects: [],
            clips: [],
            ...(kind === 'synth' ? { instrument: defaultSynthConfig() } : {}),
            ...(kind === 'drum' ? { drumKit: defaultDrumKit() } : {}),
            ...(kind === 'audio' ? { armed: false } : {}),
          };
          return { project: { ...s.project, tracks: [...s.project.tracks, track] } };
        });
        return id;
      },

      removeTrack: (trackId) =>
        set((s) => ({
          project: { ...s.project, tracks: s.project.tracks.filter((t) => t.id !== trackId) },
        })),

      reorderTracks: (fromIndex, toIndex) =>
        set((s) => {
          const tracks = [...s.project.tracks];
          const [moved] = tracks.splice(fromIndex, 1);
          if (!moved) return s;
          tracks.splice(toIndex, 0, moved);
          return { project: { ...s.project, tracks } };
        }),

      renameTrack: (trackId, name) =>
        set((s) => ({ project: withTrack(s.project, trackId, (t) => ({ ...t, name })) })),

      updateTrackMixer: (trackId, patch) =>
        set((s) => ({
          project: withTrack(s.project, trackId, (t) => ({ ...t, mixer: { ...t.mixer, ...patch } })),
        })),

      addTrackEffect: (trackId, effect) =>
        set((s) => ({
          project: withTrack(s.project, trackId, (t) => ({ ...t, effects: [...t.effects, effect] })),
        })),

      removeTrackEffect: (trackId, effectId) =>
        set((s) => ({
          project: withTrack(s.project, trackId, (t) => ({
            ...t,
            effects: t.effects.filter((e) => e.id !== effectId),
          })),
        })),

      reorderTrackEffects: (trackId, fromIndex, toIndex) =>
        set((s) => ({
          project: withTrack(s.project, trackId, (t) => {
            const effects = [...t.effects];
            const [moved] = effects.splice(fromIndex, 1);
            if (!moved) return t;
            effects.splice(toIndex, 0, moved);
            return { ...t, effects };
          }),
        })),

      updateTrackEffect: (trackId, effectId, patch) =>
        set((s) => ({
          project: withTrack(s.project, trackId, (t) => ({
            ...t,
            effects: t.effects.map((e) => (e.id === effectId ? { ...e, ...patch } : e)),
          })),
        })),

      addMasterEffect: (effect) =>
        set((s) => ({
          project: { ...s.project, masterEffects: [...s.project.masterEffects, effect] },
        })),

      removeMasterEffect: (effectId) =>
        set((s) => ({
          project: {
            ...s.project,
            masterEffects: s.project.masterEffects.filter((e) => e.id !== effectId),
          },
        })),

      reorderMasterEffects: (fromIndex, toIndex) =>
        set((s) => {
          const effects = [...s.project.masterEffects];
          const [moved] = effects.splice(fromIndex, 1);
          if (!moved) return s;
          effects.splice(toIndex, 0, moved);
          return { project: { ...s.project, masterEffects: effects } };
        }),

      updateMasterEffect: (effectId, patch) =>
        set((s) => ({
          project: {
            ...s.project,
            masterEffects: s.project.masterEffects.map((e) =>
              e.id === effectId ? { ...e, ...patch } : e,
            ),
          },
        })),

      addClip: (trackId, clip) =>
        set((s) => ({
          project: withTrack(s.project, trackId, (t) => ({ ...t, clips: [...t.clips, clip] })),
        })),

      addDefaultPatternClip: (trackId) => {
        const id = generateId('clip');
        const steps = 16;
        set((s) => {
          const track = s.project.tracks.find((t) => t.id === trackId);
          const clip: Clip = {
            id,
            startTicks: 0,
            lengthTicks: patternLengthTicks(steps),
            name: track ? nextClipName(track, 'pattern', 'Pattern') : undefined,
            kind: 'pattern',
            pattern: createDefaultPattern(steps),
          };
          return {
            project: withTrack(s.project, trackId, (t) => ({ ...t, clips: [...t.clips, clip] })),
          };
        });
        return id;
      },

      addDefaultMidiClip: (trackId) => {
        const id = generateId('clip');
        set((s) => {
          const track = s.project.tracks.find((t) => t.id === trackId);
          const clip: Clip = {
            id,
            startTicks: 0,
            lengthTicks: patternLengthTicks(16),
            name: track ? nextClipName(track, 'midi', 'MIDI') : undefined,
            kind: 'midi',
            notes: [],
          };
          return {
            project: withTrack(s.project, trackId, (t) => ({ ...t, clips: [...t.clips, clip] })),
          };
        });
        return id;
      },

      updateClip: (trackId, clipId, patch) =>
        set((s) => ({
          project: withTrack(s.project, trackId, (t) => ({
            ...t,
            clips: t.clips.map((c) => (c.id === clipId ? ({ ...c, ...patch } as Clip) : c)),
          })),
        })),

      // Same-track drags call updateClip directly; this is only for the
      // "dragged onto a different track" case, done as one atomic set() so
      // it's a single undo step rather than a remove-then-add pair.
      moveClipToTrack: (fromTrackId, toTrackId, clipId, patch) =>
        set((s) => {
          if (fromTrackId === toTrackId) {
            return {
              project: withTrack(s.project, fromTrackId, (t) => ({
                ...t,
                clips: t.clips.map((c) => (c.id === clipId ? ({ ...c, ...patch } as Clip) : c)),
              })),
            };
          }
          const fromTrack = s.project.tracks.find((t) => t.id === fromTrackId);
          const clip = fromTrack?.clips.find((c) => c.id === clipId);
          if (!clip) return s;
          const movedClip = { ...clip, ...patch } as Clip;
          return {
            project: {
              ...s.project,
              tracks: s.project.tracks.map((t) => {
                if (t.id === fromTrackId) return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
                if (t.id === toTrackId) return { ...t, clips: [...t.clips, movedClip] };
                return t;
              }),
            },
          };
        }),

      // Pattern clips have no split semantics (their steps are fixed
      // positions within one full loop, not a stretch of independent
      // content) — the UI simply never offers split for a `kind: 'pattern'`
      // clip, and this is a defensive no-op if ever called on one anyway.
      splitClip: (trackId, clipId, atTicks) =>
        set((s) => {
          const track = s.project.tracks.find((t) => t.id === trackId);
          const clip = track?.clips.find((c) => c.id === clipId);
          if (!clip || clip.kind === 'pattern') return s;

          const relativeSplit = atTicks - clip.startTicks;
          if (relativeSplit <= 0 || relativeSplit >= clip.lengthTicks) return s;

          // Volume keyframes are clip-relative, so a split has to redistribute
          // them by the same before/after boundary as notes, shifting the
          // second half's ticks back to 0 — same reasoning as the notes split
          // below, just for the automation curve instead of note events.
          const firstKeyframes = clip.volumeKeyframes?.filter((k) => k.ticks < relativeSplit);
          const secondKeyframes = clip.volumeKeyframes
            ?.filter((k) => k.ticks >= relativeSplit)
            .map((k) => ({ ...k, ticks: k.ticks - relativeSplit }));

          const newId = generateId('clip');
          let firstHalf: Clip;
          let secondHalf: Clip;

          if (clip.kind === 'midi') {
            firstHalf = {
              ...clip,
              lengthTicks: relativeSplit,
              notes: clip.notes.filter((n) => n.startTicks < relativeSplit),
              volumeKeyframes: firstKeyframes,
            };
            secondHalf = {
              ...clip,
              id: newId,
              startTicks: atTicks,
              lengthTicks: clip.lengthTicks - relativeSplit,
              notes: clip.notes
                .filter((n) => n.startTicks >= relativeSplit)
                .map((n) => ({ ...n, startTicks: n.startTicks - relativeSplit })),
              volumeKeyframes: secondKeyframes,
            };
          } else {
            firstHalf = { ...clip, lengthTicks: relativeSplit, volumeKeyframes: firstKeyframes };
            secondHalf = {
              ...clip,
              id: newId,
              startTicks: atTicks,
              lengthTicks: clip.lengthTicks - relativeSplit,
              bufferOffsetSec: clip.bufferOffsetSec + ticksToSeconds(relativeSplit, s.project.bpm),
              volumeKeyframes: secondKeyframes,
            };
          }

          return {
            project: withTrack(s.project, trackId, (t) => ({
              ...t,
              clips: t.clips.flatMap((c) => (c.id === clipId ? [firstHalf, secondHalf] : [c])),
            })),
          };
        }),

      removeClip: (trackId, clipId) =>
        set((s) => ({
          project: withTrack(s.project, trackId, (t) => ({
            ...t,
            clips: t.clips.filter((c) => c.id !== clipId),
          })),
        })),

      duplicateClip: (trackId, clipId) => {
        const track = get().project.tracks.find((t) => t.id === trackId);
        const source = track?.clips.find((c) => c.id === clipId);
        if (!source) return undefined;
        const newId = generateId('clip');
        // Pattern/note data must be deep-copied so editing the duplicate never
        // mutates the original (v1 has no linked-pattern concept).
        const copy: Clip = {
          ...source,
          ...(source.kind === 'pattern'
            ? { pattern: structuredClone(source.pattern) }
            : source.kind === 'midi'
              ? { notes: source.notes.map((n) => ({ ...n })) }
              : {}),
          volumeKeyframes: source.volumeKeyframes?.map((k) => ({ ...k })),
          id: newId,
          startTicks: source.startTicks + source.lengthTicks,
        };
        set((s) => ({
          project: withTrack(s.project, trackId, (t) => ({ ...t, clips: [...t.clips, copy] })),
        }));
        return newId;
      },

      setTrackInstrument: (trackId, instrument) =>
        set((s) => ({ project: withTrack(s.project, trackId, (t) => ({ ...t, instrument })) })),

      setTrackDrumKit: (trackId, drumKit) =>
        set((s) => ({ project: withTrack(s.project, trackId, (t) => ({ ...t, drumKit })) })),

      setTrackArmed: (trackId, armed) =>
        set((s) => ({
          project: withTrack(s.project, trackId, (t) => ({ ...t, armed })),
        })),

      addScene: (name) => {
        const id = generateId('scene');
        set((s) => {
          const scene: Scene = { id, name: name ?? `Scene ${s.project.scenes.length + 1}` };
          return { project: { ...s.project, scenes: [...s.project.scenes, scene] } };
        });
        return id;
      },

      renameScene: (sceneId, name) =>
        set((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) => (sc.id === sceneId ? { ...sc, name } : sc)),
          },
        })),

      // Also clears sceneId off any clip that referenced it, so removing a
      // scene never leaves a dangling reference — those clips just fall
      // back to Timeline-only (invisible in the Session grid, unchanged in
      // the Timeline itself).
      removeScene: (sceneId) =>
        set((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.filter((sc) => sc.id !== sceneId),
            tracks: s.project.tracks.map((t) => ({
              ...t,
              clips: t.clips.map((c) => (c.sceneId === sceneId ? { ...c, sceneId: undefined } : c)),
            })),
          },
        })),

      reorderScenes: (fromIndex, toIndex) =>
        set((s) => {
          const scenes = [...s.project.scenes];
          const [moved] = scenes.splice(fromIndex, 1);
          if (!moved) return s;
          scenes.splice(toIndex, 0, moved);
          return { project: { ...s.project, scenes } };
        }),

      setClipScene: (trackId, clipId, sceneId) =>
        set((s) => ({
          project: withTrack(s.project, trackId, (t) => ({
            ...t,
            clips: t.clips.map((c) => (c.id === clipId ? { ...c, sceneId } : c)),
          })),
        })),
    }),
    {
      limit: 200,
      // Only the `project` field is undoable; selection/UI state lives elsewhere.
      partialize: (state) => ({ project: state.project }),
    },
  ),
);

export const useProjectTemporalStore = <T>(
  selector: (state: TemporalState<{ project: Project }>) => T,
): T => useStore(useProjectStore.temporal, selector);

/**
 * Wrap a drag/pointer gesture that calls a store action on every move event
 * (velocity drag, note move/resize, marquee...) with these so the whole
 * gesture becomes ONE undo step instead of one per pointermove. zundo pushes
 * to history on every tracked `set()` by default; pausing during the
 * gesture and resuming on release relies on the fact that the last entry
 * pushed before pause() is the pre-gesture state, and nothing pushes again
 * until the next tracked set() after resume() — so undo lands exactly back
 * at "before the drag," not one pixel in.
 */
export function pauseHistory(): void {
  useProjectStore.temporal.getState().pause();
}

export function resumeHistory(): void {
  useProjectStore.temporal.getState().resume();
}
