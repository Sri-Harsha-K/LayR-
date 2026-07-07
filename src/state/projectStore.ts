import { create, useStore } from 'zustand';
import { temporal } from 'zundo';
import type { TemporalState } from 'zundo';
import { generateId } from '../utils/id';
import {
  DEFAULT_DRUM_LANES,
  TRACK_COLORS,
  type Clip,
  type DrumLaneConfig,
  type EffectInstance,
  type Project,
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
  };
}

function nextTrackColor(existing: Track[]): TrackColor {
  const used = new Set(existing.map((t) => t.color));
  const free = TRACK_COLORS.find((c) => !used.has(c));
  return free ?? TRACK_COLORS[existing.length % TRACK_COLORS.length]!;
}

function defaultDrumKit(): DrumLaneConfig[] {
  return DEFAULT_DRUM_LANES.map((l) => ({
    laneId: l.laneId,
    label: l.label,
    gainDb: 0,
    mute: false,
  }));
}

export function defaultSynthConfig(): SynthConfig {
  return {
    engine: 'poly',
    presetName: 'Warm Pad',
    params: {},
  };
}

interface ProjectActions {
  loadProject: (project: Project) => void;
  setBpm: (bpm: number) => void;
  setMasterGainDb: (db: number) => void;
  addTrack: (kind: Track['kind'], name?: string) => string;
  removeTrack: (trackId: string) => void;
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
  updateClip: (trackId: string, clipId: string, patch: Partial<Clip>) => void;
  removeClip: (trackId: string, clipId: string) => void;
  duplicateClip: (trackId: string, clipId: string) => string | undefined;
  setTrackInstrument: (trackId: string, instrument: SynthConfig) => void;
  setTrackDrumKit: (trackId: string, drumKit: DrumLaneConfig[]) => void;
  setTrackArmed: (trackId: string, armed: boolean) => void;
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

      loadProject: (project) => set({ project }),

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

      updateClip: (trackId, clipId, patch) =>
        set((s) => ({
          project: withTrack(s.project, trackId, (t) => ({
            ...t,
            clips: t.clips.map((c) => (c.id === clipId ? ({ ...c, ...patch } as Clip) : c)),
          })),
        })),

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
        const copy: Clip = {
          ...source,
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
