// UI metadata for editing an EffectInstance's generic params record. Kept
// separate from engine/effects.ts (which only knows defaults, not sane UI
// ranges/units) — this is a presentation concern, not an audio one.
import type { EffectType } from '../../state/types';

export type EffectField =
  | { key: string; label: string; kind: 'number'; min: number; max: number; step: number; unit?: string }
  | { key: string; label: string; kind: 'select'; options: string[] };

export const EFFECT_FIELDS: Record<EffectType, EffectField[]> = {
  eq3: [
    { key: 'low', label: 'Low', kind: 'number', min: -24, max: 24, step: 0.5, unit: 'dB' },
    { key: 'mid', label: 'Mid', kind: 'number', min: -24, max: 24, step: 0.5, unit: 'dB' },
    { key: 'high', label: 'High', kind: 'number', min: -24, max: 24, step: 0.5, unit: 'dB' },
    { key: 'lowFrequency', label: 'Low Freq', kind: 'number', min: 20, max: 1000, step: 10, unit: 'Hz' },
    { key: 'highFrequency', label: 'High Freq', kind: 'number', min: 500, max: 10000, step: 50, unit: 'Hz' },
  ],
  compressor: [
    { key: 'threshold', label: 'Threshold', kind: 'number', min: -60, max: 0, step: 1, unit: 'dB' },
    { key: 'ratio', label: 'Ratio', kind: 'number', min: 1, max: 20, step: 0.5, unit: ':1' },
    { key: 'attack', label: 'Attack', kind: 'number', min: 0, max: 0.5, step: 0.001, unit: 's' },
    { key: 'release', label: 'Release', kind: 'number', min: 0, max: 1, step: 0.01, unit: 's' },
  ],
  reverb: [
    { key: 'decay', label: 'Decay', kind: 'number', min: 0.1, max: 10, step: 0.1, unit: 's' },
    { key: 'wet', label: 'Mix', kind: 'number', min: 0, max: 1, step: 0.01 },
  ],
  delay: [
    { key: 'time', label: 'Time', kind: 'select', options: ['16n', '8n', '8n.', '4n', '4n.', '2n'] },
    { key: 'feedback', label: 'Feedback', kind: 'number', min: 0, max: 0.95, step: 0.01 },
    { key: 'wet', label: 'Mix', kind: 'number', min: 0, max: 1, step: 0.01 },
  ],
  distortion: [
    { key: 'amount', label: 'Amount', kind: 'number', min: 0, max: 1, step: 0.01 },
    { key: 'wet', label: 'Mix', kind: 'number', min: 0, max: 1, step: 0.01 },
  ],
  filter: [
    { key: 'frequency', label: 'Freq', kind: 'number', min: 20, max: 20000, step: 10, unit: 'Hz' },
    { key: 'type', label: 'Type', kind: 'select', options: ['lowpass', 'highpass', 'bandpass', 'notch'] },
    { key: 'Q', label: 'Q', kind: 'number', min: 0.1, max: 20, step: 0.1 },
  ],
  chorus: [
    { key: 'frequency', label: 'Rate', kind: 'number', min: 0.1, max: 10, step: 0.1, unit: 'Hz' },
    { key: 'delayTime', label: 'Delay', kind: 'number', min: 0, max: 20, step: 0.1, unit: 'ms' },
    { key: 'depth', label: 'Depth', kind: 'number', min: 0, max: 1, step: 0.01 },
    { key: 'wet', label: 'Mix', kind: 'number', min: 0, max: 1, step: 0.01 },
  ],
  limiter: [{ key: 'threshold', label: 'Threshold', kind: 'number', min: -60, max: 0, step: 0.5, unit: 'dB' }],
};

export const EFFECT_LABELS: Record<EffectType, string> = {
  eq3: 'EQ3',
  compressor: 'Compressor',
  reverb: 'Reverb',
  delay: 'Delay',
  distortion: 'Distortion',
  filter: 'Filter',
  chorus: 'Chorus',
  limiter: 'Limiter',
};

export const EFFECT_TYPES: EffectType[] = [
  'eq3',
  'compressor',
  'reverb',
  'delay',
  'distortion',
  'filter',
  'chorus',
  'limiter',
];
