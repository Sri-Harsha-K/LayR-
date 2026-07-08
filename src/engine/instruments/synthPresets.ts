import type { SynthConfig, SynthEngine } from '../../state/types';

// 10 shipped presets spanning all five engines, each tuned for a distinct
// character rather than just varying one parameter.
export const SYNTH_PRESETS: SynthConfig[] = [
  {
    engine: 'poly',
    presetName: 'Warm Pad',
    params: { oscType: 'triangle', attack: 0.6, decay: 0.4, sustain: 0.8, release: 1.4, filterCutoff: 3200, filterQ: 0.7 },
  },
  {
    engine: 'poly',
    presetName: 'Strings-ish',
    params: { oscType: 'sawtooth', attack: 0.35, decay: 0.3, sustain: 0.75, release: 1.0, filterCutoff: 4200, filterQ: 0.8 },
  },
  {
    engine: 'poly',
    presetName: 'Lead Saw',
    params: { oscType: 'sawtooth', attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2, filterCutoff: 9000, filterQ: 1.4 },
  },
  {
    engine: 'fm',
    presetName: 'Bell Keys',
    params: { harmonicity: 3.5, modulationIndex: 14, attack: 0.001, decay: 1.2, sustain: 0.05, release: 1.5, filterCutoff: 10000 },
  },
  {
    engine: 'fm',
    presetName: 'EP Keys',
    params: { harmonicity: 2, modulationIndex: 6, attack: 0.005, decay: 0.8, sustain: 0.15, release: 0.8, filterCutoff: 6000 },
  },
  {
    engine: 'fm',
    presetName: 'Glass Keys',
    params: { harmonicity: 5.3, modulationIndex: 20, attack: 0.001, decay: 0.6, sustain: 0.02, release: 1.0, filterCutoff: 12000 },
  },
  {
    engine: 'mono',
    presetName: 'Sub',
    params: { oscType: 'sine', attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.3, filterCutoff: 250, filterQ: 0.3, glide: 0 },
  },
  {
    engine: 'mono',
    presetName: 'Acid Bass',
    params: { oscType: 'sawtooth', attack: 0.001, decay: 0.15, sustain: 0.2, release: 0.15, filterCutoff: 350, filterQ: 8, glide: 0.03 },
  },
  {
    engine: 'pluck',
    presetName: 'Pluck',
    params: { filterCutoff: 3500, resonance: 0.94, attackNoise: 1.2 },
  },
  {
    engine: 'duo',
    presetName: 'Duo Lead',
    params: { harmonicity: 1.5, vibratoRate: 5.5, vibratoAmount: 0.4, glide: 0.06, oscType: 'sawtooth', attack: 0.02, decay: 0.2, sustain: 0.7, release: 0.4 },
  },
];

export function getPresetsForEngine(engine: SynthEngine): SynthConfig[] {
  return SYNTH_PRESETS.filter((p) => p.engine === engine);
}

export function getPresetByName(presetName: string): SynthConfig | undefined {
  return SYNTH_PRESETS.find((p) => p.presetName === presetName);
}

export function getDefaultPresetForEngine(engine: SynthEngine): SynthConfig {
  return getPresetsForEngine(engine)[0] ?? SYNTH_PRESETS[0]!;
}
