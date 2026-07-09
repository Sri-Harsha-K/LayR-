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

/** A decoded sample's presentation metadata for the Library tab — kept separate from `buffers` since UI needs a listable/searchable summary, not the raw buffer. */
export interface SampleMeta {
  ref: string;
  name: string;
  durationSeconds: number;
  source: 'recorded' | 'imported';
}

const library: SampleMeta[] = [];
const libraryListeners = new Set<() => void>();

function notifyLibraryChanged(): void {
  libraryListeners.forEach((listener) => listener());
}

/** LibraryPanel subscribes to this to re-render when a new sample is decoded — samples can arrive at any time (recording, drum-lane sample load, project open), not just on mount. */
export function subscribeSampleLibrary(listener: () => void): () => void {
  libraryListeners.add(listener);
  return () => libraryListeners.delete(listener);
}

export function getSampleLibrary(): readonly SampleMeta[] {
  return library;
}

export async function registerSample(
  name: string,
  data: ArrayBuffer,
  source: SampleMeta['source'] = 'imported',
): Promise<{ ref: string; durationSeconds: number }> {
  const ref = `mem://${generateId('sample')}/${name}`;
  const audioBuffer = await Tone.getContext().rawContext.decodeAudioData(data.slice(0));
  buffers.set(ref, new Tone.ToneAudioBuffer(audioBuffer));
  library.push({ ref, name, durationSeconds: audioBuffer.duration, source });
  notifyLibraryChanged();
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
  const name = nameFromRef(ref);
  // The original recorded-vs-imported distinction isn't preserved in the
  // ref itself — recordingController.ts always names a take "Recording",
  // so that's used as a best-effort heuristic on re-hydration.
  library.push({ ref, name, durationSeconds: audioBuffer.duration, source: name.startsWith('Recording') ? 'recorded' : 'imported' });
  notifyLibraryChanged();
}

function nameFromRef(ref: string): string {
  const rest = ref.slice(REF_PREFIX.length);
  const slash = rest.indexOf('/');
  return slash === -1 ? rest : rest.slice(slash + 1);
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
