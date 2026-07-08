// Synth engine factory: SynthConfig (engine + params) -> a playable Tone
// instrument. All five engines conform to Tone's base Instrument contract
// (triggerAttackRelease(note, duration, time?, velocity?)), so the rest of
// the engine never needs to special-case "is this one polyphonic or not" —
// PolySynth-wrapped engines allocate a voice per call, monophonic engines
// (mono/pluck/duo) just retrigger, which is exactly correct mono-synth
// behavior for overlapping notes.
import * as Tone from 'tone';
import type { SynthConfig } from '../../state/types';

type ParamRecord = SynthConfig['params'];
type OscType = 'sine' | 'triangle' | 'sawtooth' | 'square';

function num(params: ParamRecord, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === 'number' ? v : fallback;
}

function str(params: ParamRecord, key: string, fallback: string): string {
  const v = params[key];
  return typeof v === 'string' ? v : fallback;
}

function oscType(params: ParamRecord, fallback: OscType): OscType {
  return str(params, 'oscType', fallback) as OscType;
}

function envelope(
  params: ParamRecord,
  fallback: { attack: number; decay: number; sustain: number; release: number },
) {
  return {
    attack: num(params, 'attack', fallback.attack),
    decay: num(params, 'decay', fallback.decay),
    sustain: num(params, 'sustain', fallback.sustain),
    release: num(params, 'release', fallback.release),
  };
}

export interface ToneInstrumentLike extends Tone.ToneAudioNode {
  triggerAttackRelease(
    note: Tone.Unit.Frequency,
    duration: Tone.Unit.Time,
    time?: Tone.Unit.Time,
    velocity?: Tone.Unit.NormalRange,
  ): this;
  releaseAll?(time?: Tone.Unit.Time): this;
  set(props: Record<string, unknown>): this;
}

function buildRawInstrument(config: SynthConfig): ToneInstrumentLike {
  const p = config.params;
  switch (config.engine) {
    case 'poly':
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: oscType(p, 'triangle') },
        envelope: envelope(p, { attack: 0.02, decay: 0.3, sustain: 0.7, release: 0.8 }),
      });
    case 'fm':
      return new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: num(p, 'harmonicity', 3),
        modulationIndex: num(p, 'modulationIndex', 10),
        oscillator: { type: oscType(p, 'sine') },
        modulation: { type: 'sine' },
        envelope: envelope(p, { attack: 0.005, decay: 0.3, sustain: 0.3, release: 0.6 }),
        modulationEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.5 },
      });
    case 'mono':
      return new Tone.MonoSynth({
        oscillator: { type: oscType(p, 'sawtooth') },
        envelope: envelope(p, { attack: 0.004, decay: 0.15, sustain: 0.5, release: 0.25 }),
        filter: { Q: num(p, 'filterQ', 2), type: 'lowpass' },
        filterEnvelope: {
          attack: 0.01,
          decay: 0.2,
          sustain: 0.25,
          release: 0.4,
          baseFrequency: num(p, 'filterCutoff', 400),
          octaves: 3.5,
        },
        portamento: num(p, 'glide', 0),
      });
    case 'pluck':
      return new Tone.PluckSynth({
        attackNoise: num(p, 'attackNoise', 1),
        dampening: num(p, 'filterCutoff', 4000),
        resonance: num(p, 'resonance', 0.9),
      });
    case 'duo':
      return new Tone.DuoSynth({
        harmonicity: num(p, 'harmonicity', 1.5),
        vibratoRate: num(p, 'vibratoRate', 5),
        vibratoAmount: num(p, 'vibratoAmount', 0.3),
        portamento: num(p, 'glide', 0.04),
        voice0: { oscillator: { type: oscType(p, 'sawtooth') }, envelope: envelope(p, { attack: 0.02, decay: 0.2, sustain: 0.6, release: 0.5 }) },
        voice1: { oscillator: { type: oscType(p, 'sawtooth') }, envelope: envelope(p, { attack: 0.02, decay: 0.2, sustain: 0.6, release: 0.5 }) },
      });
    default: {
      const exhaustive: never = config.engine;
      throw new Error(`Unknown synth engine: ${exhaustive as string}`);
    }
  }
}

/**
 * Applies a param change to an already-built instrument via Tone's generic
 * `.set()` instead of rebuilding it — mirrors buildRawInstrument's shape
 * per engine. This is what keeps a slider drag on a synth param from
 * rebuilding the whole audio graph on every pixel of movement (see
 * engine/projectDiff.ts): same node, same voices, just updated options.
 */
function applyParamsLive(raw: ToneInstrumentLike, config: SynthConfig): void {
  const p = config.params;
  switch (config.engine) {
    case 'poly':
      raw.set({ oscillator: { type: oscType(p, 'triangle') }, envelope: envelope(p, { attack: 0.02, decay: 0.3, sustain: 0.7, release: 0.8 }) });
      return;
    case 'fm':
      raw.set({
        harmonicity: num(p, 'harmonicity', 3),
        modulationIndex: num(p, 'modulationIndex', 10),
        oscillator: { type: oscType(p, 'sine') },
        envelope: envelope(p, { attack: 0.005, decay: 0.3, sustain: 0.3, release: 0.6 }),
      });
      return;
    case 'mono':
      raw.set({
        oscillator: { type: oscType(p, 'sawtooth') },
        envelope: envelope(p, { attack: 0.004, decay: 0.15, sustain: 0.5, release: 0.25 }),
        filter: { Q: num(p, 'filterQ', 2) },
        filterEnvelope: { baseFrequency: num(p, 'filterCutoff', 400) },
        portamento: num(p, 'glide', 0),
      });
      return;
    case 'pluck':
      raw.set({
        attackNoise: num(p, 'attackNoise', 1),
        dampening: num(p, 'filterCutoff', 4000),
        resonance: num(p, 'resonance', 0.9),
      });
      return;
    case 'duo':
      raw.set({
        harmonicity: num(p, 'harmonicity', 1.5),
        vibratoRate: num(p, 'vibratoRate', 5),
        vibratoAmount: num(p, 'vibratoAmount', 0.3),
        portamento: num(p, 'glide', 0.04),
      });
      return;
    default: {
      const exhaustive: never = config.engine;
      throw new Error(`Unknown synth engine: ${exhaustive as string}`);
    }
  }
}

export interface SynthInstrument {
  output: Tone.ToneAudioNode;
  triggerNote(pitch: number, durationTicks: number, time: Tone.Unit.Time, velocity: number): void;
  releaseAll(time?: Tone.Unit.Time): void;
  /** Live-updates params on the existing node (no rebuild) — see applyParamsLive. */
  setParams(config: SynthConfig): void;
  dispose(): void;
}

/**
 * MIDI note number -> frequency in Hz. `Tone.mtof` types its input as a
 * narrow MidiNote literal union, which a runtime-computed pitch can't
 * satisfy — the formula it wraps is one line, so compute it directly.
 */
export function midiToFrequency(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

export function createSynthInstrument(config: SynthConfig): SynthInstrument {
  const raw = buildRawInstrument(config);
  // 'mono' shapes its own timbre with a built-in filter + filter envelope
  // (that's the whole appeal of an Acid Bass-style engine); everything else
  // has no filter of its own, so filterCutoff/filterQ drive this shared
  // external one instead. Same two param keys either way — the UI never
  // needs to know which mechanism is behind them.
  const hasBuiltInFilter = config.engine === 'mono';
  const filter = new Tone.Filter({
    type: 'lowpass',
    frequency: hasBuiltInFilter ? 20000 : num(config.params, 'filterCutoff', 8000),
    Q: hasBuiltInFilter ? 0.5 : num(config.params, 'filterQ', 1),
  });
  raw.connect(filter);

  return {
    output: filter,
    triggerNote(pitch, durationTicks, time, velocity) {
      raw.triggerAttackRelease(midiToFrequency(pitch), `${Math.max(1, Math.round(durationTicks))}i`, time, velocity);
    },
    releaseAll(time) {
      raw.releaseAll?.(time);
    },
    setParams(nextConfig) {
      applyParamsLive(raw, nextConfig);
      if (!hasBuiltInFilter) {
        filter.frequency.rampTo(num(nextConfig.params, 'filterCutoff', 8000), 0.02);
        filter.Q.rampTo(num(nextConfig.params, 'filterQ', 1), 0.02);
      }
    },
    dispose() {
      raw.dispose();
      filter.dispose();
    },
  };
}
