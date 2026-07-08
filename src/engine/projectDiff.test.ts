import { describe, expect, it } from 'vitest';
import { diffProject } from './projectDiff';
import { createEmptyProject, defaultSynthConfig } from '../state/projectStore';
import type { Project, Track } from '../state/types';

function synthTrack(id: string): Track {
  return {
    id,
    name: 'Synth',
    color: '#4f9bd9',
    kind: 'synth',
    mixer: { gainDb: 0, pan: 0, mute: false, solo: false },
    effects: [],
    clips: [],
    instrument: defaultSynthConfig(),
  };
}

describe('diffProject', () => {
  it('reports none for the identical reference', () => {
    const p = createEmptyProject();
    expect(diffProject(p, p)).toEqual({ kind: 'none' });
  });

  it('reports none when nothing actually changed despite a new top-level object', () => {
    const p = createEmptyProject();
    const copy: Project = { ...p };
    expect(diffProject(p, copy)).toEqual({ kind: 'none' });
  });

  it('reports bpm-only when only bpm differs', () => {
    const p = createEmptyProject();
    const next = { ...p, bpm: 140 };
    expect(diffProject(p, next)).toEqual({ kind: 'bpm', bpm: 140 });
  });

  it('reports instrument-params when only one track\'s instrument params change', () => {
    const track = synthTrack('t1');
    const p: Project = { ...createEmptyProject(), tracks: [track] };
    const newParams = { ...track.instrument!.params, attack: 0.5 };
    const next: Project = {
      ...p,
      tracks: [{ ...track, instrument: { ...track.instrument!, params: newParams } }],
    };
    expect(diffProject(p, next)).toEqual({ kind: 'instrument-params', trackId: 't1', params: newParams });
  });

  it('falls back to rebuild when the instrument engine changes, not just params', () => {
    const track = synthTrack('t1');
    const p: Project = { ...createEmptyProject(), tracks: [track] };
    const next: Project = {
      ...p,
      tracks: [{ ...track, instrument: { ...track.instrument!, engine: 'fm' } }],
    };
    expect(diffProject(p, next)).toEqual({ kind: 'rebuild' });
  });

  it('falls back to rebuild when a track is added', () => {
    const p = createEmptyProject();
    const next: Project = { ...p, tracks: [synthTrack('t1')] };
    expect(diffProject(p, next)).toEqual({ kind: 'rebuild' });
  });

  it('falls back to rebuild when more than one track changes at once', () => {
    const t1 = synthTrack('t1');
    const t2 = synthTrack('t2');
    const p: Project = { ...createEmptyProject(), tracks: [t1, t2] };
    const next: Project = {
      ...p,
      tracks: [
        { ...t1, instrument: { ...t1.instrument!, params: { attack: 1 } } },
        { ...t2, instrument: { ...t2.instrument!, params: { attack: 2 } } },
      ],
    };
    expect(diffProject(p, next)).toEqual({ kind: 'rebuild' });
  });

  it('falls back to rebuild when a mixer field changes (not yet a live-patch case)', () => {
    const track = synthTrack('t1');
    const p: Project = { ...createEmptyProject(), tracks: [track] };
    const next: Project = {
      ...p,
      tracks: [{ ...track, mixer: { ...track.mixer, gainDb: -6 } }],
    };
    expect(diffProject(p, next)).toEqual({ kind: 'rebuild' });
  });
});
