// In-memory registry of decoded audio buffers for user-uploaded drum
// samples, keyed by a ref string stored in DrumLaneConfig.sampleRef. Actual
// on-disk/IndexedDB persistence of the underlying bytes happens via the
// platform adapter (Phase 5); this registry just keeps decoded buffers
// around for the engine to use without re-decoding on every graph rebuild.
import * as Tone from 'tone';
import { generateId } from '../utils/id';

const buffers = new Map<string, Tone.ToneAudioBuffer>();

export async function registerSample(name: string, data: ArrayBuffer): Promise<string> {
  const ref = `mem://${generateId('sample')}/${name}`;
  const audioBuffer = await Tone.getContext().rawContext.decodeAudioData(data.slice(0));
  buffers.set(ref, new Tone.ToneAudioBuffer(audioBuffer));
  return ref;
}

export function getSampleBuffer(ref: string): Tone.ToneAudioBuffer | undefined {
  return buffers.get(ref);
}

export function hasSampleBuffer(ref: string): boolean {
  return buffers.has(ref);
}
