// Effect factory: EffectInstance (type + params) -> a connectable Tone node.
// One switch statement is the whole contract graph.ts needs; Phase 3 adds
// the UI that edits `params` live via updateEffectParams.
import * as Tone from 'tone';
import type { EffectInstance, EffectType } from '../state/types';

export type EffectNode = Tone.ToneAudioNode;

function num(params: EffectInstance['params'], key: string, fallback: number): number {
  const v = params[key];
  return typeof v === 'number' ? v : fallback;
}

function str(params: EffectInstance['params'], key: string, fallback: string): string {
  const v = params[key];
  return typeof v === 'string' ? v : fallback;
}

export const EFFECT_DEFAULT_PARAMS: Record<EffectType, Record<string, number | string>> = {
  eq3: { low: 0, mid: 0, high: 0, lowFrequency: 400, highFrequency: 2500 },
  compressor: { threshold: -24, ratio: 4, attack: 0.01, release: 0.2 },
  reverb: { decay: 2, wet: 0.3 },
  delay: { time: '8n', feedback: 0.3, wet: 0.25 },
  distortion: { amount: 0.3, wet: 1 },
  filter: { frequency: 2000, type: 'lowpass', Q: 1 },
  chorus: { frequency: 1.5, delayTime: 3.5, depth: 0.7, wet: 0.5 },
  limiter: { threshold: -1 },
};

export function createEffectNode(instance: EffectInstance): EffectNode {
  const p = instance.params;
  switch (instance.type) {
    case 'eq3':
      return new Tone.EQ3({
        low: num(p, 'low', 0),
        mid: num(p, 'mid', 0),
        high: num(p, 'high', 0),
        lowFrequency: num(p, 'lowFrequency', 400),
        highFrequency: num(p, 'highFrequency', 2500),
      });
    case 'compressor':
      return new Tone.Compressor({
        threshold: num(p, 'threshold', -24),
        ratio: num(p, 'ratio', 4),
        attack: num(p, 'attack', 0.01),
        release: num(p, 'release', 0.2),
      });
    case 'reverb':
      return new Tone.Reverb({ decay: num(p, 'decay', 2), wet: num(p, 'wet', 0.3) });
    case 'delay':
      return new Tone.FeedbackDelay({
        delayTime: str(p, 'time', '8n'),
        feedback: num(p, 'feedback', 0.3),
        wet: num(p, 'wet', 0.25),
      });
    case 'distortion':
      return new Tone.Distortion({ distortion: num(p, 'amount', 0.3), wet: num(p, 'wet', 1) });
    case 'filter':
      return new Tone.Filter({
        frequency: num(p, 'frequency', 2000),
        type: str(p, 'type', 'lowpass') as BiquadFilterType,
        Q: num(p, 'Q', 1),
      });
    case 'chorus':
      return new Tone.Chorus({
        frequency: num(p, 'frequency', 1.5),
        delayTime: num(p, 'delayTime', 3.5),
        depth: num(p, 'depth', 0.7),
        wet: num(p, 'wet', 0.5),
      }).start();
    case 'limiter':
      return new Tone.Limiter(num(p, 'threshold', -1));
    default: {
      const _exhaustive: never = instance.type;
      throw new Error(`Unknown effect type: ${_exhaustive as string}`);
    }
  }
}

/** Builds a serial chain of (non-bypassed) effect nodes, connecting input -> ... -> output. Returns the created nodes in order. */
export function buildEffectChain(
  instances: EffectInstance[],
  input: Tone.ToneAudioNode,
  output: Tone.ToneAudioNode,
): EffectNode[] {
  const active = instances.filter((e) => !e.bypass);
  const nodes = active.map(createEffectNode);
  let previous: Tone.ToneAudioNode = input;
  for (const node of nodes) {
    previous.connect(node);
    previous = node;
  }
  previous.connect(output);
  return nodes;
}
