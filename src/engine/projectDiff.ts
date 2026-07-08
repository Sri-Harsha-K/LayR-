// Classifies a project change so AudioEngine can decide: ramp an existing
// node in place, or tear down and rebuild the graph. Rebuilding on every
// change is correct but audibly wrong for anything a user drags continuously
// (a BPM field, a synth param slider, and in Phase 3 a gain fader or effect
// knob) — those need to update in place with no node churn, per the brief's
// "debounce param knobs -> engine with rampTo" rule. Pure and unit-tested;
// every store action does an immutable update that only touches what it
// means to touch, so reference equality on untouched fields is reliable.
import type { Project, SynthConfig, Track } from '../state/types';

export type ProjectDiff =
  | { kind: 'none' }
  | { kind: 'bpm'; bpm: number }
  | { kind: 'instrument-params'; trackId: string; params: SynthConfig['params'] }
  | { kind: 'rebuild' };

function sameTrackExceptInstrumentParams(a: Track, b: Track): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.color === b.color &&
    a.kind === b.kind &&
    a.mixer === b.mixer &&
    a.effects === b.effects &&
    a.clips === b.clips &&
    a.armed === b.armed &&
    a.drumKit === b.drumKit &&
    !!a.instrument &&
    !!b.instrument &&
    a.instrument.engine === b.instrument.engine &&
    a.instrument.presetName === b.instrument.presetName &&
    a.instrument.params !== b.instrument.params
  );
}

export function diffProject(a: Project, b: Project): ProjectDiff {
  if (a === b) return { kind: 'none' };

  const nonTrackFieldsEqual =
    a.masterEffects === b.masterEffects && a.masterGainDb === b.masterGainDb && a.name === b.name;

  if (nonTrackFieldsEqual && a.tracks === b.tracks) {
    return a.bpm !== b.bpm ? { kind: 'bpm', bpm: b.bpm } : { kind: 'none' };
  }

  if (nonTrackFieldsEqual && a.bpm === b.bpm && a.tracks.length === b.tracks.length) {
    let changedIndex = -1;
    for (let i = 0; i < a.tracks.length; i++) {
      if (a.tracks[i] !== b.tracks[i]) {
        if (changedIndex !== -1) return { kind: 'rebuild' }; // more than one track changed
        changedIndex = i;
      }
    }
    if (changedIndex !== -1) {
      const ta = a.tracks[changedIndex]!;
      const tb = b.tracks[changedIndex]!;
      if (sameTrackExceptInstrumentParams(ta, tb)) {
        return { kind: 'instrument-params', trackId: tb.id, params: tb.instrument!.params };
      }
    }
  }

  return { kind: 'rebuild' };
}
