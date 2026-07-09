// UI metadata for editing a synth track's live params, per engine. Mirrors
// mixer/effectFields.ts's split: engine/instruments/synthFactory.ts only
// knows the param *keys* it reads (with fallbacks), not sane UI ranges —
// that's a presentation concern, kept here instead.
import type { SynthEngine } from '../../state/types';

export type SynthParamField =
  | { key: string; label: string; kind: 'knob'; min: number; max: number; step: number; unit?: string }
  | { key: string; label: string; kind: 'select'; options: string[] };

const OSC_TYPES = ['sine', 'triangle', 'sawtooth', 'square'];

const oscField: SynthParamField = { key: 'oscType', label: 'Wave', kind: 'select', options: OSC_TYPES };
const envelopeFields: SynthParamField[] = [
  { key: 'attack', label: 'Attack', kind: 'knob', min: 0, max: 2, step: 0.01, unit: 's' },
  { key: 'decay', label: 'Decay', kind: 'knob', min: 0, max: 2, step: 0.01, unit: 's' },
  { key: 'sustain', label: 'Sustain', kind: 'knob', min: 0, max: 1, step: 0.01 },
  { key: 'release', label: 'Release', kind: 'knob', min: 0, max: 3, step: 0.01, unit: 's' },
];
const filterFields: SynthParamField[] = [
  { key: 'filterCutoff', label: 'Cutoff', kind: 'knob', min: 20, max: 12000, step: 10, unit: 'Hz' },
  { key: 'filterQ', label: 'Reso', kind: 'knob', min: 0.1, max: 10, step: 0.1 },
];

export const SYNTH_PARAM_FIELDS: Record<SynthEngine, SynthParamField[]> = {
  poly: [oscField, ...envelopeFields, ...filterFields],
  fm: [
    { key: 'harmonicity', label: 'Harmon.', kind: 'knob', min: 0.5, max: 8, step: 0.1 },
    { key: 'modulationIndex', label: 'Mod Idx', kind: 'knob', min: 0, max: 30, step: 0.5 },
    oscField,
    ...envelopeFields,
    ...filterFields,
  ],
  mono: [oscField, ...envelopeFields, ...filterFields, { key: 'glide', label: 'Glide', kind: 'knob', min: 0, max: 0.5, step: 0.01, unit: 's' }],
  pluck: [
    { key: 'attackNoise', label: 'Pluck', kind: 'knob', min: 0, max: 5, step: 0.1 },
    { key: 'resonance', label: 'Reso', kind: 'knob', min: 0, max: 0.99, step: 0.01 },
    { key: 'filterCutoff', label: 'Damp', kind: 'knob', min: 200, max: 8000, step: 50, unit: 'Hz' },
  ],
  duo: [
    { key: 'harmonicity', label: 'Harmon.', kind: 'knob', min: 0.5, max: 8, step: 0.1 },
    { key: 'vibratoRate', label: 'Vib Rate', kind: 'knob', min: 0.1, max: 10, step: 0.1, unit: 'Hz' },
    { key: 'vibratoAmount', label: 'Vib Amt', kind: 'knob', min: 0, max: 1, step: 0.01 },
    { key: 'glide', label: 'Glide', kind: 'knob', min: 0, max: 0.5, step: 0.01, unit: 's' },
    oscField,
    ...envelopeFields,
  ],
};
