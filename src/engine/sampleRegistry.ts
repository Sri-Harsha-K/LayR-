// In-memory registry of decoded audio buffers, keyed by a ref string stored
// in either DrumLaneConfig.sampleRef or an audio Clip's fileRef (drum
// samples and recorded takes share this one registry — same "decode once,
// look up by ref" need either way). Actual on-disk/IndexedDB persistence of
// the underlying bytes is handled by projectIO.ts + the platform adapter;
// this registry just keeps decoded buffers around for the engine to use
// without re-decoding on every graph rebuild.
import * as Tone from 'tone';
import { generateId } from '../utils/id';

const buffers = new Map<string, Tone.ToneAudioBuffer>();

export async function registerSample(
  name: string,
  data: ArrayBuffer,
): Promise<{ ref: string; durationSeconds: number }> {
  const ref = `mem://${generateId('sample')}/${name}`;
  const audioBuffer = await Tone.getContext().rawContext.decodeAudioData(data.slice(0));
  buffers.set(ref, new Tone.ToneAudioBuffer(audioBuffer));
  return { ref, durationSeconds: audioBuffer.duration };
}

/**
 * Decodes and stores a buffer at a caller-supplied ref rather than minting a
 * new one — used only when re-hydrating a project on load, where the ref is
 * whatever was already saved in project.json (via DrumLaneConfig.sampleRef /
 * Clip.fileRef) and must resolve to the same key it did before saving.
 */
export async function registerSampleAtRef(ref: string, data: ArrayBuffer): Promise<void> {
  const audioBuffer = await Tone.getContext().rawContext.decodeAudioData(data.slice(0));
  buffers.set(ref, new Tone.ToneAudioBuffer(audioBuffer));
}

export function getSampleBuffer(ref: string): Tone.ToneAudioBuffer | undefined {
  return buffers.get(ref);
}

export function hasSampleBuffer(ref: string): boolean {
  return buffers.has(ref);
}

const REF_PREFIX = 'mem://';
const REL_DIR = 'audio/';
const REL_SEPARATOR = '__';

/**
 * Deterministic, reversible mapping between an in-memory ref
 * (`mem://<id>/<name>`) and a project-folder-relative audio file path
 * (`audio/<id>__<name>`), so project.json's stored refs never need
 * rewriting on save/load — only the on-disk filename is derived from them.
 */
export function refToRelPath(ref: string): string {
  const rest = ref.slice(REF_PREFIX.length);
  const slash = rest.indexOf('/');
  const id = slash === -1 ? rest : rest.slice(0, slash);
  const name = slash === -1 ? '' : rest.slice(slash + 1);
  return `${REL_DIR}${id}${REL_SEPARATOR}${name}`;
}

export function relPathToRef(relPath: string): string {
  const base = relPath.startsWith(REL_DIR) ? relPath.slice(REL_DIR.length) : relPath;
  const sep = base.indexOf(REL_SEPARATOR);
  const id = sep === -1 ? base : base.slice(0, sep);
  const name = sep === -1 ? '' : base.slice(sep + REL_SEPARATOR.length);
  return `${REF_PREFIX}${id}/${name}`;
}
