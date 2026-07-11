import { describe, expect, it } from 'vitest';
import { sanitizeProject } from './sanitizeProject';
import { createEmptyProject, defaultSynthConfig } from './projectStore';
import type { Project, Track } from './types';

function synthTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 't1',
    name: 'Synth',
    color: '#4f9bd9',
    kind: 'synth',
    mixer: { gainDb: 0, pan: 0, mute: false, solo: false },
    effects: [],
    clips: [],
    instrument: defaultSynthConfig(),
    ...overrides,
  };
}

describe('sanitizeProject', () => {
  it('degrades non-object input to a valid empty project instead of throwing', () => {
    for (const garbage of [null, undefined, 'not a project', 42, []]) {
      const p = sanitizeProject(garbage);
      expect(p.version).toBe(1);
      expect(p.tracks).toEqual([]);
      expect(p.scenes).toEqual([]);
      expect(Number.isFinite(p.bpm)).toBe(true);
    }
  });

  it('round-trips an already-valid project unchanged in shape', () => {
    const p: Project = { ...createEmptyProject(), tracks: [synthTrack()] };
    const out = sanitizeProject(p);
    expect(out.tracks).toHaveLength(1);
    expect(out.tracks[0]!.kind).toBe('synth');
    expect(out.tracks[0]!.instrument!.engine).toBe('poly');
  });

  it('clamps an out-of-range or non-finite bpm', () => {
    expect(sanitizeProject({ bpm: 99999 }).bpm).toBeLessThanOrEqual(240);
    expect(sanitizeProject({ bpm: -50 }).bpm).toBeGreaterThanOrEqual(40);
    expect(Number.isFinite(sanitizeProject({ bpm: NaN }).bpm)).toBe(true);
    expect(Number.isFinite(sanitizeProject({ bpm: Infinity }).bpm)).toBe(true);
    expect(Number.isFinite(sanitizeProject({ bpm: 'not a number' }).bpm)).toBe(true);
  });

  it('drops a track with an unknown kind', () => {
    const p = sanitizeProject({ tracks: [{ id: 't1', kind: 'not-a-real-kind' }] });
    expect(p.tracks).toEqual([]);
  });

  it('drops effects with an unknown type instead of letting them reach the audio graph', () => {
    const p = sanitizeProject({
      tracks: [
        {
          id: 't1',
          kind: 'synth',
          effects: [
            { id: 'fx1', type: 'reverb', bypass: false, params: { decay: 2, wet: 0.3 } },
            { id: 'fx2', type: 'not-a-real-effect', bypass: false, params: {} },
          ],
        },
      ],
    });
    expect(p.tracks[0]!.effects).toHaveLength(1);
    expect(p.tracks[0]!.effects[0]!.type).toBe('reverb');
  });

  it('falls back to a default synth config for an unknown engine, never leaving instrument undefined on a synth track', () => {
    const p = sanitizeProject({ tracks: [{ id: 't1', kind: 'synth', instrument: { engine: 'not-a-real-engine' } }] });
    expect(p.tracks[0]!.instrument).toBeDefined();
    expect(p.tracks[0]!.instrument!.engine).toBe('poly');
  });

  it('reassigns an invalid or out-of-palette track color to a real one', () => {
    const p = sanitizeProject({ tracks: [{ id: 't1', kind: 'drum', color: '#ff00ff' }] });
    expect(p.tracks[0]!.color).not.toBe('#ff00ff');
  });

  it('drops a clip with an unrecognized kind', () => {
    const p = sanitizeProject({
      tracks: [{ id: 't1', kind: 'synth', clips: [{ id: 'c1', kind: 'not-a-real-kind', startTicks: 0, lengthTicks: 100 }] }],
    });
    expect(p.tracks[0]!.clips).toEqual([]);
  });

  it('drops an audio clip with no fileRef rather than keeping a silently-broken clip', () => {
    const p = sanitizeProject({
      tracks: [{ id: 't1', kind: 'audio', clips: [{ id: 'c1', kind: 'audio', startTicks: 0, lengthTicks: 100 }] }],
    });
    expect(p.tracks[0]!.clips).toEqual([]);
  });

  it('forces pattern step count to 16 or 32 and builds a lane per declared step count', () => {
    const p = sanitizeProject({
      tracks: [
        {
          id: 't1',
          kind: 'drum',
          clips: [
            {
              id: 'c1',
              kind: 'pattern',
              startTicks: 0,
              lengthTicks: 100,
              pattern: { steps: 999, swing: 5, lanes: [{ laneId: 'kick', steps: [{ on: true, velocity: 2 }] }] },
            },
          ],
        },
      ],
    });
    const clip = p.tracks[0]!.clips[0]!;
    expect(clip.kind).toBe('pattern');
    if (clip.kind !== 'pattern') throw new Error('unreachable');
    expect(clip.pattern.steps).toBe(16);
    expect(clip.pattern.swing).toBeLessThanOrEqual(0.66);
    expect(clip.pattern.lanes[0]!.steps).toHaveLength(16);
    expect(clip.pattern.lanes[0]!.steps[0]!.velocity).toBeLessThanOrEqual(1);
  });

  it('drops notes with a non-finite pitch and clamps the rest into range', () => {
    const p = sanitizeProject({
      tracks: [
        {
          id: 't1',
          kind: 'synth',
          clips: [
            {
              id: 'c1',
              kind: 'midi',
              startTicks: 0,
              lengthTicks: 960,
              notes: [
                { pitch: NaN, startTicks: 0, durationTicks: 240, velocity: 0.8 },
                { pitch: 999, startTicks: -50, durationTicks: -10, velocity: 5 },
              ],
            },
          ],
        },
      ],
    });
    const clip = p.tracks[0]!.clips[0]!;
    if (clip.kind !== 'midi') throw new Error('unreachable');
    expect(clip.notes).toHaveLength(1);
    expect(clip.notes[0]!.pitch).toBeLessThanOrEqual(127);
    expect(clip.notes[0]!.startTicks).toBeGreaterThanOrEqual(0);
    expect(clip.notes[0]!.durationTicks).toBeGreaterThan(0);
    expect(clip.notes[0]!.velocity).toBeLessThanOrEqual(1);
  });

  it('clears a clip.sceneId that points at a scene which got dropped', () => {
    const p = sanitizeProject({
      scenes: [{ id: 'scene-real', name: 'Scene 1' }],
      tracks: [
        {
          id: 't1',
          kind: 'synth',
          clips: [{ id: 'c1', kind: 'midi', startTicks: 0, lengthTicks: 960, notes: [], sceneId: 'scene-does-not-exist' }],
        },
      ],
    });
    expect(p.tracks[0]!.clips[0]!.sceneId).toBeUndefined();
  });

  it('caps array lengths so a pathological file cannot force unbounded work', () => {
    const manyTracks = Array.from({ length: 5000 }, (_, i) => ({ id: `t${i}`, kind: 'synth' }));
    const p = sanitizeProject({ tracks: manyTracks });
    expect(p.tracks.length).toBeLessThan(5000);
  });

  it('drops non-finite effect param values (NaN/Infinity) instead of passing them to the audio graph', () => {
    const p = sanitizeProject({
      tracks: [
        {
          id: 't1',
          kind: 'synth',
          effects: [
            { id: 'fx1', type: 'filter', bypass: false, params: { frequency: Infinity, Q: NaN, type: 'lowpass' } },
          ],
        },
      ],
    });
    const params = p.tracks[0]!.effects[0]!.params;
    expect(params['frequency']).toBeUndefined();
    expect(params['Q']).toBeUndefined();
    expect(params['type']).toBe('lowpass');
  });

  it('clamps an absurdly large-but-finite param magnitude into a safe range', () => {
    const p = sanitizeProject({
      tracks: [
        { id: 't1', kind: 'synth', effects: [{ id: 'fx1', type: 'filter', bypass: false, params: { frequency: 1e12 } }] },
      ],
    });
    const frequency = p.tracks[0]!.effects[0]!.params['frequency'];
    expect(typeof frequency).toBe('number');
    expect(Number.isFinite(frequency)).toBe(true);
    expect(frequency as number).toBeLessThanOrEqual(100_000);
  });
});
