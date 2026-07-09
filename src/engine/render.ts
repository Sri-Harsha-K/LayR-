// Offline rendering + export. Thin wrapper around graph.ts per that file's
// own header comment: buildGraph relies on Tone's "current context"
// convention, and Tone.Offline swaps that context for the duration of its
// callback, so the exact same graph builder serves both live playback and
// every export format here.
import * as Tone from 'tone';
import { platform } from '../platform';
import type { Project } from '../state/types';
import { furthestClipEndTicks } from '../state/projectStore';
import { buildGraph, type BuiltGraph } from './graph';
import { PPQ, ticksToSeconds } from './time';
import { encodeWav, type WavBitDepth } from './wavEncoder';
import { encodeMp3 } from './mp3Encoder';
import { buildZip, type ZipEntry } from './zipWriter';

// Effect release tails (reverb/delay) can ring past the last clip's end.
// Rather than computing an exact per-effect tail length, pad the render
// window by a flat amount — deliberately approximate, documented here.
const RELEASE_TAIL_SECONDS = 1;
const MIN_DURATION_SECONDS = 1;

function projectDurationSeconds(project: Project): number {
  const lastTick = furthestClipEndTicks(project.tracks);
  return Math.max(MIN_DURATION_SECONDS, ticksToSeconds(lastTick, project.bpm) + RELEASE_TAIL_SECONDS);
}

/** Renders the full project (every track/clip, respecting mute/solo/effects) to a raw decoded buffer at the given sample rate — the shared step every export format below builds on. */
async function renderToBuffer(project: Project, sampleRate: number): Promise<Tone.ToneAudioBuffer> {
  const duration = projectDurationSeconds(project);
  let built: BuiltGraph | undefined;

  // The callback only *sets up* scheduling — it must NOT wait on anything
  // driven by the offline clock (e.g. a Transport.scheduleOnce firing at
  // `duration`), because Tone doesn't advance that clock until *after* this
  // callback resolves and Offline calls context.render() internally. `render()`
  // is what actually plays the scheduled `duration` seconds; the callback's
  // job is just "build the graph and start the transport," synchronously.
  const rendered = await Tone.Offline(
    () => {
      // initTransport()'s PPQ-set is guarded by a module-level flag and so is
      // NOT idempotent across contexts (see transport.ts) — set it directly
      // on this offline context's transport instead of calling initTransport().
      Tone.getTransport().PPQ = PPQ;
      built = buildGraph(project);
      Tone.getTransport().start(0);
    },
    duration,
    2,
    sampleRate,
  );

  built?.dispose();
  return rendered;
}

/** Renders the full project to PCM WAV bytes at the given sample rate/bit depth. */
export async function renderProjectToWav(
  project: Project,
  sampleRate = 48000,
  bitDepth: WavBitDepth = 16,
): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = await renderToBuffer(project, sampleRate);
  return encodeWav(buffer, bitDepth);
}

/** Renders the full project to MP3 bytes at the given sample rate. */
export async function renderProjectToMp3(
  project: Project,
  sampleRate = 48000,
  kbps = 192,
): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = await renderToBuffer(project, sampleRate);
  return encodeMp3(buffer, kbps);
}

// Forces exactly one track audible regardless of the project's real
// mute/solo state (mirrors graph.ts's own `isSilenced = mute || (anySolo &&
// !solo)` rule) — an in-memory clone only, never touches the real store or
// undo history.
function projectSoloingOnlyTrack(project: Project, trackId: string): Project {
  return {
    ...project,
    tracks: project.tracks.map((t) => ({
      ...t,
      mixer: { ...t.mixer, solo: t.id === trackId, mute: t.id === trackId ? false : t.mixer.mute },
    })),
  };
}

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_').trim() || 'Track';
}

/**
 * Renders one WAV per track (each soloed in isolation, still through the
 * master effects chain — a deliberate simplification, not a raw pre-master
 * mix) and bundles them into one .zip via the hand-rolled zipWriter, so
 * "Stems" is one save-dialog prompt instead of one per track.
 */
export async function renderStemsToZip(
  project: Project,
  sampleRate = 48000,
  bitDepth: WavBitDepth = 16,
): Promise<Uint8Array<ArrayBuffer>> {
  const entries: ZipEntry[] = [];
  for (const track of project.tracks) {
    const buffer = await renderToBuffer(projectSoloingOnlyTrack(project, track.id), sampleRate);
    entries.push({ name: `${sanitizeFileName(track.name)}.wav`, data: encodeWav(buffer, bitDepth) });
  }
  return buildZip(entries);
}

export type ExportFormat = 'wav' | 'mp3' | 'flac' | 'stems';

export interface ExportOptions {
  format: ExportFormat;
  sampleRate: number;
  bitDepth: WavBitDepth;
  mp3Kbps?: number;
}

// Module-level guard (not per-caller state) so the Export dialog and its
// Ctrl/Cmd+E shortcut can't kick off two overlapping offline renders.
let exportInFlight = false;

/**
 * Renders per `options.format` and hands the bytes to the platform's
 * save-file prompt. Returns false if an export was already running or the
 * user cancelled the save dialog.
 */
export async function exportProject(project: Project, options: ExportOptions): Promise<boolean> {
  if (exportInFlight) return false;
  exportInFlight = true;
  try {
    switch (options.format) {
      case 'wav': {
        const bytes = await renderProjectToWav(project, options.sampleRate, options.bitDepth);
        return await platform.exportFile(bytes, `${sanitizeFileName(project.name)}.wav`);
      }
      case 'mp3': {
        const bytes = await renderProjectToMp3(project, options.sampleRate, options.mp3Kbps);
        return await platform.exportFile(bytes, `${sanitizeFileName(project.name)}.mp3`);
      }
      case 'stems': {
        const bytes = await renderStemsToZip(project, options.sampleRate, options.bitDepth);
        return await platform.exportFile(bytes, `${sanitizeFileName(project.name)}-stems.zip`);
      }
      case 'flac':
        // libflacjs is the one real integration risk flagged in this app's
        // export plan (unmaintained since 2020, WASM+worker wiring that
        // can't be verified without a live browser pass in this
        // environment) — degrading clearly here rather than shipping an
        // unverified integration. See PROGRESS.md's Phase 9 notes.
        throw new Error('FLAC export is not available in this build yet.');
    }
  } finally {
    exportInFlight = false;
  }
}

/** Convenience wrapper for the old one-click "Bounce to WAV" behavior (default settings, no dialog). */
export async function bounceProject(project: Project): Promise<boolean> {
  return exportProject(project, { format: 'wav', sampleRate: 48000, bitDepth: 16 });
}
